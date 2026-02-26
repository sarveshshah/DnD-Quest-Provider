from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
import importlib

from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import json
import uuid

from langchain_core.messages import HumanMessage
import sqlite3
import os

from dnd import campaign_graph as app_graph, mcp_server_session, research_model, DynamicHitlActions, PartyDetails
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

app = FastAPI()

DB_PATH = "./db/state.db"

app.add_middleware(
    CORSMiddleware,
    allow_origins = ["http://localhost:3000"],
    allow_credentials = True,
    allow_methods = ["*"],
    allow_headers = ["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

class GenerateRequest(BaseModel):
    prompt: str = ""
    difficulty: str = "Medium"
    terrain: str = "Forest"
    requirements: str = ""
    thread_id: str | None = None
    resume_action: str | None = None
    party_name: str | None = None
    party_size: int | None = 4


class PdfExportRequest(BaseModel):
    html: str
    file_name: str | None = "campaign_export"

@app.get("/threads")
async def get_threads():
    if not os.path.exists(DB_PATH):
        return []
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # LangGraph checkpoints table joined with our custom threads_meta table
    # max(checkpoint_id) gives us the latest checkpoint for each thread, which is UUID v1-like
    cursor.execute("""
        SELECT c.thread_id, 
               max(c.checkpoint_id) as latest_checkpoint_id,
               min(c.checkpoint_id) as first_checkpoint_id,
               tm.is_archived
        FROM checkpoints c
        LEFT JOIN threads_meta tm ON c.thread_id = tm.thread_id
        GROUP BY c.thread_id
        ORDER BY latest_checkpoint_id DESC
        LIMIT 50
    """)
    rows = cursor.fetchall()
    conn.close()
    
    import datetime
    import uuid as uuid_module
    threads = []
    
    def checkpoint_id_to_datetime(checkpoint_id: str) -> str:
        """Extract real creation time from LangGraph checkpoint UUID (UUID v6 timestamp)."""
        try:
            u = uuid_module.UUID(checkpoint_id)
            if u.version == 6:
                # UUID v6 stores time as: time_high (32b) | time_mid (16b) | version+time_low (16b)
                # Reconstruct 60-bit gregorian timestamp (100-ns intervals since Oct 15, 1582)
                n = u.int
                time_high = (n >> 96) & 0xFFFFFFFF
                time_mid  = (n >> 80) & 0xFFFF
                time_low  = (n >> 64) & 0x0FFF  # strip 4-bit version nibble
                ts_100ns = (time_high << 28) | (time_mid << 12) | time_low
                ts = (ts_100ns - 0x01b21dd213814000) / 1e7
                return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).replace(tzinfo=None).isoformat()
            elif u.version == 1:
                ts = (u.time - 0x01b21dd213814000) / 1e7
                return datetime.datetime.utcfromtimestamp(ts).isoformat()
        except Exception:
            pass
        # Fallback: use current time
        return datetime.datetime.utcnow().isoformat()
    
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as memory:
        compiled_graph = app_graph.compile(checkpointer=memory, interrupt_after=["PlannerNode"])
        for row in rows:
            tid = row["thread_id"]
            first_checkpoint_id = row["first_checkpoint_id"]
            is_arch = bool(row["is_archived"]) if "is_archived" in row.keys() and row["is_archived"] else False
            
            # Extract real creation time from the very first checkpoint UUID
            created_at = checkpoint_id_to_datetime(first_checkpoint_id)
            
            try:
                state = await compiled_graph.aget_state({"configurable": {"thread_id": tid}})
                
                # Try to extract the narrative title first
                title = None
                if state.values.get("title"):
                    title = state.values["title"]
                    
                # If no narrative title yet, fall back to Primary Antagonist from plan
                if not title and state.values.get("campaign_plan"):
                    antagonist = getattr(state.values["campaign_plan"], "primary_antagonist", None)
                    if antagonist:
                        title = f"Vs. {antagonist}"
                        
                # Absolute fallback
                if not title:
                    title = f"Campaign {tid[:6]}"
                    
            except Exception:
                title = f"Campaign {tid[:6]}"
                
            threads.append({
                "id": tid,
                "name": title, 
                "createdAt": created_at,
                "isArchived": is_arch
            })
            
    return threads

@app.patch("/threads/{thread_id}/archive")
def toggle_archive_thread(thread_id: str):
    if not os.path.exists(DB_PATH):
        return {"error": "Database not found"}
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Check if exists
    cursor.execute("SELECT is_archived FROM threads_meta WHERE thread_id = ?", (thread_id,))
    row = cursor.fetchone()
    
    if row is None:
        cursor.execute("INSERT INTO threads_meta (thread_id, is_archived) VALUES (?, 1)", (thread_id,))
        new_val = True
    else:
        new_val = not bool(row[0])
        cursor.execute("UPDATE threads_meta SET is_archived = ? WHERE thread_id = ?", (1 if new_val else 0, thread_id))
        
    conn.commit()
    conn.close()
    return {"id": thread_id, "isArchived": new_val}

@app.get("/threads/{thread_id}")
async def get_thread_data(thread_id: str):
    if not os.path.exists(DB_PATH):
        return {"error": "Database not found"}
        
    # LangGraph State DB retrieval
    config = {"configurable": {"thread_id": thread_id}}
    
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as memory:
        compiled_graph = app_graph.compile(checkpointer=memory, interrupt_after=["PlannerNode"])
        state = await compiled_graph.aget_state(config)
    
    if not state or not state.values:
        return {"messages": []}
        
    vals = state.values
    
    # Map the retrieved pure state Pydantic models back to JSON standard format for React
    plan_dict = vals.get("campaign_plan").model_dump() if hasattr(vals.get("campaign_plan"), "model_dump") else vals.get("campaign_plan")
    party_dict = vals.get("party_details").model_dump() if hasattr(vals.get("party_details"), "model_dump") else vals.get("party_details")
    
    narrative_dict = None
    if vals.get("title") and vals.get("background"):
        narrative_dict = {
            "title": vals.get("title"),
            "description": vals.get("description"),
            "background": vals.get("background"),
            "rewards": vals.get("rewards")
        }
        
    # Include chat history
    chat_messages = vals.get("chat_messages", [])
    
    # We pack the parsed state into structural elements the frontend understands natively as output history
    history_data = {
        "messages": [
            {"output": json.dumps({"campaign_plan": plan_dict}) if plan_dict else "{}"},
            {"output": json.dumps({"party_details": party_dict}) if party_dict else "{}"},
            {"output": json.dumps(narrative_dict) if narrative_dict else "{}"}
        ],
        "chat_messages": chat_messages
    }
    
    return history_data

class ChatRequest(BaseModel):
    message: str

@app.post("/threads/{thread_id}/chat")
async def chat_with_campaign(thread_id: str, req: ChatRequest):
    """Send a chat message to an existing campaign thread and get a DM response."""
    
    config = {"configurable": {"thread_id": thread_id}}
    
    async with AsyncSqliteSaver.from_conn_string(DB_PATH) as memory:
        compiled_graph = app_graph.compile(checkpointer=memory, interrupt_after=["PlannerNode"])
        
        # Get current state to read existing chat history
        current_state = await compiled_graph.aget_state(config)
        if not current_state or not current_state.values:
            return {"error": "Thread not found"}
        
        existing_chat = current_state.values.get("chat_messages", [])
        updated_chat = existing_chat + [{"role": "user", "content": req.message}]
        
        # Directly invoke the chat_node function with reconstructed state
        from dnd import chat_node, CampaignState
        
        vals = current_state.values
        state = CampaignState(
            terrain=vals.get("terrain"),
            difficulty=vals.get("difficulty"),
            requirements=vals.get("requirements"),
            campaign_plan=vals.get("campaign_plan"),
            party_details=vals.get("party_details"),
            title=vals.get("title"),
            description=vals.get("description"),
            background=vals.get("background"),
            rewards=vals.get("rewards"),
            chat_messages=updated_chat,
        )
        
        result = await chat_node(state)
        ai_response = result.get("chat_response", "I'm sorry, I couldn't formulate a response.")
        
        # Save the full chat history back to graph state for persistence
        final_chat = updated_chat + [{"role": "assistant", "content": ai_response}]
        await compiled_graph.aupdate_state(
            config,
            {"chat_messages": final_chat, "chat_response": ai_response},
            as_node="NarrativeWriterNode"
        )
        
        return {"response": ai_response, "chat_messages": final_chat}

@app.post("/generate")
async def generate_quest(req: GenerateRequest):
    """Kicks off langgraph pipeline and streams the events back to the React Frontend as SSE"""

    async def event_generator():
        async with mcp_server_session():
            async with AsyncSqliteSaver.from_conn_string(DB_PATH) as memory:
                # Compile the graph on the fly with the async saver
                compiled_graph = app_graph.compile(checkpointer=memory, interrupt_after=["PlannerNode"])
                
                try:
                    # Provide a unique thread ID so the MemorySaver checkpointer doesn't fail
                    thread_id = req.thread_id or str(uuid.uuid4())
                    config = {"configurable": {"thread_id": thread_id}}
                    
                    # Immediately yield thread_id so client can save it for resume commands
                    yield {"event": "thread_id", "data": json.dumps({"thread_id": thread_id})}
                    
                    if req.resume_action:
                        # We are resuming from an interrupt!
                        if req.resume_action == "approve":
                            stream_iterator = compiled_graph.astream_events(None, config=config, version="v2")
                        else:
                            # User typed a Custom Edit or clicked a Dynamic Suggestion!
                            # We update the state with the new instruction and wipe the plan so it reruns
                            await compiled_graph.aupdate_state(
                                config,
                                {"requirements": req.resume_action, "campaign_plan": None},
                                as_node="PlannerNode",
                            )
                            stream_iterator = compiled_graph.astream_events(None, config=config, version="v2")
                    else:
                        party_data = None
                        if req.party_name or req.party_size:
                            party_data = PartyDetails(
                                party_name=req.party_name or "Not Provided",
                                party_size=req.party_size or 4,
                                characters=[]
                            )
                            
                        initial_state = {
                            "messages": [HumanMessage(content=req.prompt)],
                            "difficulty": req.difficulty,
                            "terrain": req.terrain,
                            "requirements": req.requirements,
                            "campaign_plan": None,
                            "party_details": party_data,
                            "title": None,
                            "description": None,
                            "background": None,
                            "rewards": None,
                        }
                        stream_iterator = compiled_graph.astream_events(initial_state, config=config, version="v2")

                    async for event in stream_iterator:
                        kind = event["event"]
                        name = event.get("name", "")
    
                        if kind == "on_chain_end" and "campaign_plan" in event["data"].get("output", {}):
                            plan = event["data"]["output"]["campaign_plan"]
                            yield {
                                "event": "plan",
                                "data": plan.model_dump_json() if hasattr(plan, 'model_dump_json') else json.dumps(plan)
                            }
                        if kind == "on_chain_end" and "party_details" in event["data"].get("output", {}):
                            party = event["data"]["output"]["party_details"]
                            yield {
                                "event": "party",
                                "data": party.model_dump_json() if hasattr(party, 'model_dump_json') else json.dumps(party)
                            }
                        elif kind == "on_chain_end" and "title" in event["data"].get("output", {}):
                            title = event["data"]["output"].get("title")
                            desc = event["data"]["output"].get("description")
                            bg = event["data"]["output"].get("background")
                            rewards = event["data"]["output"].get("rewards")
                            yield {
                                "event": "narrative",
                                "data": json.dumps({"title": title, "description": desc, "background": bg, "rewards": rewards})
                            }
                        elif kind == "on_chain_start":
                            # Customize status message to be D&D themed based on the node name!
                            themed_status = None
                            if name == "PlannerNode":
                                themed_status = "🗺️ Mapping out the realm and villains..."
                            elif name == "PartyCreationNode":
                                themed_status = "⚔️ Rolling stats and crafting character sheets..."
                            elif name == "CharacterPortraitNode":
                                themed_status = "🎨 Painting portraits of the heroes..."
                            elif name == "NarrativeWriterNode":
                                themed_status = "📜 Inscribing the legendary deeds onto parchment..."
                            elif name == "MCPToolNode":
                                themed_status = "🔍 Consulting ancient tomes..."
                            
                            if themed_status:    
                                yield {
                                    "event": "status",
                                    "data": json.dumps({"status": themed_status})
                                }
                        
                    # CHECK IF GRAPH PAUSED
                    state = await compiled_graph.aget_state(config)
                    if state.next:
                        # Graph is paused! We reached PlannerNode.
                        # Yield HITL options!
                        villain_name = state.values.get("campaign_plan").primary_antagonist if getattr(state.values.get("campaign_plan", None), "primary_antagonist", None) else "the villain"
                        conflict = state.values.get("campaign_plan").core_conflict if getattr(state.values.get("campaign_plan", None), "core_conflict", None) else "the conflict"

                        suggestion_prompt = f"Based on the plan:\nVillain: {villain_name}\nConflict: {conflict}\nSuggest 3 different directions the user might want to take this campaign by altering the plot, villain, or characters."

                        try:
                            suggestions = await research_model.with_structured_output(DynamicHitlActions).ainvoke(suggestion_prompt)
                            hitl_data = suggestions.model_dump()
                        except Exception:
                            hitl_data = {
                                "action_1_label": "💥 Make it harder", "action_1_payload": "Make the enemies stronger and the dungeon deadlier.",
                                "action_2_label": "🎭 More roleplay", "action_2_payload": "Focus more on diplomacy and NPC interaction.",
                                "action_3_label": "🐉 Add dragons", "action_3_payload": "Change the villain to an ancient dragon."
                            }

                        yield {"event": "hitl", "data": json.dumps(hitl_data)}
                    else:
                        yield {"event": "done", "data": "Generation Complete!"}
                        
                except Exception as e:
                    import traceback
                    tb = traceback.format_exc()
                    print(f"CRITICAL FASTAPI ERROR: {tb}")
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": str(e) + "\n\nTraceback:\n" + tb})
                    }
                    
    return EventSourceResponse(event_generator())


@app.post("/export/pdf")
async def export_pdf(req: PdfExportRequest):
    html = (req.html or "").strip()
    if not html:
        raise HTTPException(status_code=400, detail="Missing HTML payload for PDF export")

    try:
        module_name = "playwright" + ".async_api"
        async_playwright = importlib.import_module(module_name).async_playwright
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Playwright is not installed on the backend environment"
        ) from exc

    safe_name = (req.file_name or "campaign_export").strip() or "campaign_export"
    safe_name = "".join(ch for ch in safe_name if ch.isalnum() or ch in ("-", "_", " ")).strip()[:80]
    if not safe_name:
        safe_name = "campaign_export"

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            await page.set_content(html, wait_until="networkidle")

            await page.evaluate(
                """
                async () => {
                  const images = Array.from(document.images || []);
                  await Promise.all(images.map((img) => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                      img.addEventListener('load', resolve, { once: true });
                      img.addEventListener('error', resolve, { once: true });
                    });
                  }));
                }
                """
            )

            pdf_bytes = await page.pdf(
                format="A4",
                print_background=True,
                prefer_css_page_size=True,
                margin={"top": "12mm", "right": "12mm", "bottom": "12mm", "left": "12mm"},
            )
            await browser.close()

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'}
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {exc}") from exc

if __name__ == "__main__":
    uvicorn.run(app, host = "0.0.0.0", port = 8001, reload = True)
    
