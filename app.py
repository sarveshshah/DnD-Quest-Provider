import chainlit as cl
from chainlit.input_widget import TextInput, Select, Slider

from typing import Optional
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

import uuid

from dnd import app as campaign_generator, CampaignState, PartyDetails, CampaignPlan

from dotenv import load_dotenv
load_dotenv()

# --- Models ---
extractor_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    temperature=0.1,
    verbose=True
)

chat_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.7,
    verbose=True
)

# --- Schemas ---
class CampaignIntake(BaseModel):
    party_name: Optional[str] = Field(None, description="Name of the adventuring party")
    party_size: Optional[int] = Field(None, description="Number of players. CRITICAL: If the user lists specific characters, count them and set this to that number!")
    
    # Force the LLM to translate weird inputs into our strict categories
    terrain: Optional[str] = Field(None, description="The terrain. MUST map the user's request to the closest option: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark. (e.g., 'Ocean' maps to 'Coast', 'City' maps to 'Grassland')")
    difficulty: Optional[str] = Field(None, description="The difficulty. MUST map the user's request to the closest option: Easy, Medium, Hard, Deadly. (e.g., '2/10' maps to 'Easy', 'impossible' maps to 'Deadly')")
    
    new_requirements: Optional[str] = Field(None, description="Any new plot, character, or thematic requests")
    user_confirmed_start: bool = Field(default=False, description="True ONLY if user says 'start', 'randomize the rest', or 'go with it'. FALSE if they just ask to create a campaign or list requirements.")

class DynamicHitlActions(BaseModel):
    """Suggestions for the user to edit the campaign during the HITL phase."""
    action_1_label: str = Field(description="A short, catchy button label (e.g. 'Make the villain tougher', 'Add more stealth')")
    action_1_payload: str = Field(description="The actual prompt edit text to send to the planner (e.g. 'Make the villain have more HP and AC and stealth-based attacks.')")
    action_2_label: str = Field(description="A short, catchy button label (e.g. 'Change setting to a spooky swamp')")
    action_2_payload: str = Field(description="The actual prompt edit text to send to the planner (e.g. 'Move the primary locations to a spooky, fog-filled swamp.')")
    action_3_label: str = Field(description="A short, catchy button label focusing on characters")
    action_3_payload: str = Field(description="The actual prompt edit text to send to the planner (e.g. 'Change one of the characters to be a Rogue.')")

# --- Prompts ---
# Explicitly pass history as text to guarantee the model reads it
EXTRACTOR_PROMPT = ChatPromptTemplate.from_template("""You are a precise data extractor for a D&D Campaign Generator.
    
RECENT CONVERSATION HISTORY:
{chat_history_text}

LATEST USER MESSAGE:
{user_input}

YOUR JOB:
1. If the user explicitly provides parameters in their latest message, extract them.
2. CRITICAL: If the AI suggested parameters in the recent history and the user agrees (e.g. "sounds good", "yes", "do it"), you MUST extract the AI's suggested parameters.
3. If they ask to randomize, DO NOT extract random values yourself. Leave them null.
4. user_confirmed_start should be FALSE if the user asks you to "randomize", "suggest", or "pick". It should ONLY be true if they explicitly agree to start, or say a phrase like "just go with it".
""")

# Explicitly pass history as text to guarantee the model reads it
CONVERSATIONAL_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a friendly Dungeon Master assistant helping a player set up a campaign.
    
    Current collected parameters:
    {current_state}
    
    Missing required parameters:
    {missing_params}
    
    Acknowledge what the user just told you, and ask for the missing parameters. 
    
    CRITICAL RULE: If the user asks you to randomize, pick, or suggest, DO NOT ask for permission. Immediately provide EXACTLY 1 clear suggestion for each missing parameter so they can just say "yes".
    - Terrain suggestions MUST be one of: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark.
    - Difficulty suggestions MUST be one of: Easy, Medium, Hard, Deadly.
    """),
    MessagesPlaceholder(variable_name="chat_history"),
    ("human", "{user_input}")
])

# --- Helper Functions ---
def _coerce_terrain(t_str: str) -> str:
    valid = ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp", "Underdark"]
    t_title = t_str.title()
    return next((v.title() for v in valid if v in t_title), "Forest")

def _coerce_difficulty(d_str: str) -> str:
    valid = ["Easy", "Medium", "Hard", "Deadly"]
    d_title = d_str.title()
    return next((v.title() for v in valid if v in d_title), "Medium")

async def run_planner_phase(state: dict):
    """Phase 1: Run just the PlannerNode, then pause and show the plan for HITL approval."""
    if not state.get("party_name"): state["party_name"] = "Not Provided"
    if not state.get("party_size"): state["party_size"] = 4
    if not state.get("terrain"): state["terrain"] = "Forest"
    if not state.get("difficulty"): state["difficulty"] = "Medium"

    initial_graph_state = CampaignState(
        terrain=state["terrain"], 
        difficulty=state["difficulty"],
        requirements=state.get("requirements", ""), 
        roster_locked=state.get("roster_locked", True),
        party_details=PartyDetails(
            party_name=state["party_name"], 
            party_size=int(state["party_size"]),
            characters=state.get("characters", [])
        )
    )

    # If we are editing an existing plan, pass it into the state so the LLM doesn't start from scratch
    pending_plan_dict = cl.user_session.get("pending_plan")
    if pending_plan_dict:
        initial_graph_state.campaign_plan = CampaignPlan(**pending_plan_dict)

    thread_id = cl.user_session.get("thread_id")
    config = {"configurable": {"thread_id": thread_id}}
    
    planner_plan = None

    try:
        async with cl.Step(name="🗺️ Gathering the miniatures and mapping the realm...") as parent_step:
            await parent_step.send()
            
            async for output in campaign_generator.astream(initial_graph_state, config=config):
                for node_name, node_state in output.items():
                    if node_name == "PlannerNode":
                        plan = node_state.get('campaign_plan')
                        planner_plan = plan
                        async with cl.Step(name="Brainstorming the plot...", parent_id=parent_step.id) as step:
                            if plan:
                                plot_bullets = "\n".join([f"- {p}" for p in plan.plot_points])
                                locations_bullets = "\n".join([f"- {l}" for l in plan.key_locations])
                                villain_stats = ""
                                if hasattr(plan, 'villain_statblock') and plan.villain_statblock:
                                    vs = plan.villain_statblock
                                    v_attacks = "\n  - " + "\n  - ".join(vs.attacks) if vs.attacks else ""
                                    v_abilities = "\n  - " + "\n  - ".join(vs.special_abilities) if vs.special_abilities else ""
                                    villain_stats = f"\n\n**Villain Statblock:**\n- **HP:** {vs.hp} | **AC:** {vs.ac}\n- _\"{vs.flavor_quote}\"_\n- **Attacks:**{v_attacks}\n- **Abilities:**{v_abilities}"
                                step.output = f"### DM's Notes\n_{plan.thought_process}_\n\n**Villain:** {plan.primary_antagonist}{villain_stats}\n\n**Conflict:** {plan.core_conflict}\n\n**Key Locations:**\n{locations_bullets}\n\n**Plot Outline:**\n{plot_bullets}\n\n**Loot:** {plan.loot_concept}"
                            else:
                                step.output = "Thinking..."
                            step.name = "🗺️ Campaign World Planned"
                            await step.update()

            parent_step.name = "✋ Awaiting your approval..."
            await parent_step.update()

        # Graph is now paused. Surface the plan and ask for approval.
        if planner_plan:
            # Save the plan so if the user clicks edit, we can feed it back to the PlannerNode
            cl.user_session.set("pending_plan", planner_plan.model_dump())
            
            villain_name = getattr(planner_plan, 'primary_antagonist', 'the villain')
            party_size = state.get("party_size", 4)
            party_name_display = state.get("party_name", "Not Provided")
            
            # Reconstruct the plot points for the approval message
            plot_bullets = "\n".join([f"- {p}" for p in getattr(planner_plan, 'plot_points', [])])
            locations_bullets = "\n".join([f"- {l}" for l in getattr(planner_plan, 'key_locations', [])])
            
            villain_stats = ""
            if hasattr(planner_plan, 'villain_statblock') and planner_plan.villain_statblock:
                vs = planner_plan.villain_statblock
                v_attacks = "\n  - " + "\n  - ".join(vs.attacks) if vs.attacks else ""
                v_abilities = "\n  - " + "\n  - ".join(vs.special_abilities) if vs.special_abilities else ""
                villain_stats = f"\n\n**Villain Statblock:**\n- **HP:** {vs.hp} | **AC:** {vs.ac}\n- _\"{vs.flavor_quote}\"_\n- **Attacks:**{v_attacks}\n- **Abilities:**{v_abilities}"

            # Suggested Party
            suggested_party = getattr(planner_plan, 'suggested_party', [])
            if suggested_party:
                party_bullets = "\n".join([f"- **{c.name}** ({c.race} {c.class_name})" for c in suggested_party])
                party_str = f"### 🛡️ Proposed Heroes\n{party_bullets}\n\n"
            else:
                party_str = f"### 🛡️ The Party\n{party_name_display} ({party_size} heroes)\n\n"

            approval_msg = (
                f"## 🛑 Your DM Requests Approval\n\n"
                f"The campaign skeleton and hero identities are ready! Before I roll stats, select spells, and write the full lore, "
                f"do you want to proceed with this setup?\n\n"
                f"{party_str}"
                f"### 😈 Villain: {villain_name}{villain_stats}\n\n"
                f"### ⚔️ Core Conflict\n{getattr(planner_plan, 'core_conflict', 'Not specified')}\n\n"
                f"### 📍 Key Locations\n{locations_bullets}\n\n"
                f"### 📖 Plot Outline\n{plot_bullets}\n\n"
                f"---\n"
                f"*Approve to continue with character creation and lore writing, select a suggestion below, or click Edit to type a custom change.*"
            )

            # Generate dynamic suggestions
            suggestion_prompt = f"""Based on the current campaign plan:
Villain: {villain_name}
Conflict: {getattr(planner_plan, 'core_conflict', 'Not specified')}
Terrain: {state.get('terrain')}

Suggest 3 completely different directions the user might want to take this campaign by altering the plot, villain, or characters.
"""
            try:
                suggestions = await chat_model.with_structured_output(DynamicHitlActions).ainvoke(suggestion_prompt)
                actions = [
                    cl.Action(name="approve_plan_btn", payload={"approve": True}, label="✅ Looks great, continue!"),
                    cl.Action(name="dynamic_edit_btn", payload={"edit": suggestions.action_1_payload}, label=f"✨ {suggestions.action_1_label}"),
                    cl.Action(name="dynamic_edit_btn", payload={"edit": suggestions.action_2_payload}, label=f"✨ {suggestions.action_2_label}"),
                    cl.Action(name="dynamic_edit_btn", payload={"edit": suggestions.action_3_payload}, label=f"✨ {suggestions.action_3_label}"),
                    cl.Action(name="edit_plan_btn", payload={"edit": True}, label="✏️ Type custom change...")
                ]
            except Exception as e:
                # Fallback if suggestion generation fails
                actions = [
                    cl.Action(name="approve_plan_btn", payload={"approve": True}, label="✅ Looks great, continue!"),
                    cl.Action(name="edit_plan_btn", payload={"edit": True}, label="✏️ I want to make changes")
                ]

            await cl.Message(content=approval_msg, actions=actions).send()

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        await cl.Message(content=f"**Error during planning:** {str(e)}\n\n```text\n{error_details}\n```").send()


async def resume_campaign():
    """Phase 2: Resume the paused graph after user approval. Streams the rest (party + narrative)."""
    thread_id = cl.user_session.get("thread_id")
    config = {"configurable": {"thread_id": thread_id}}
    # Pull the campaign_params so we can save characters back at the end
    state = cl.user_session.get("campaign_params", {})
    final_state = {}

    try:
        async with cl.Step(name="⚔️ Rolling initiative and crafting character sheets...") as parent_step:
            await parent_step.send()
            
            party_creation_step = None
            
            # Resume by passing None — LangGraph picks up from the checkpoint
            async for output in campaign_generator.astream(None, config=config):
                for node_name, node_state in output.items():
                    if node_name == "PartyCreationNode":
                        if party_creation_step is None:
                            party_creation_step = cl.Step(name="⚔️ Rolling characters...", parent_id=parent_step.id)
                            await party_creation_step.send()
                        party = node_state.get('party_details')
                        if party:
                            party_dict = party if isinstance(party, dict) else party.model_dump()
                            party_name = party_dict.get('party_name', 'The Nameless')
                            chars = party_dict.get('characters', [])
                            char_bullets = "\n".join([f"- **{c.get('name')}**: Level {c.get('level')} {c.get('race')} {c.get('class_name', c.get('class'))}" for c in chars])
                            party_creation_step.output = f"### 📝 Roster: {party_name}\n\n{char_bullets}"
                            party_creation_step.name = "⚔️ Party Assembled"
                            await party_creation_step.update()
                            parent_step.name = "📜 Consulting the ancient tomes and penning the lore..."
                            await parent_step.update()
                        else:
                            msgs = node_state.get('messages', [])
                            if msgs and hasattr(msgs[-1], 'tool_calls') and msgs[-1].tool_calls:
                                tools_called = [tc['name'] for tc in msgs[-1].tool_calls]
                                tools_str = "\n".join([f"- 🔍 Asking the archives about: `{name}`..." for name in tools_called])
                                party_creation_step.output = f"Researching arcane secrets and armories...\n\n{tools_str}"
                            else:
                                party_creation_step.output = "Gathering stats and equipment..."
                            await party_creation_step.update()
                    elif node_name == "MCPToolNode":
                        if party_creation_step:
                            msgs = node_state.get('messages', [])
                            if msgs:
                                tool_names = [m.name for m in msgs if hasattr(m, 'name') and m.name]
                                if tool_names:
                                    tools_str = "\n".join([f"- 📖 Reading knowledge from `{name}`..." for name in tool_names])
                                    party_creation_step.output = f"Reading responses from the D&D APIs...\n\n{tools_str}"
                                    await party_creation_step.update()
                    elif node_name == "NarrativeWriterNode":
                        async with cl.Step(name="Writing the epic...", parent_id=parent_step.id) as step:
                            step.output = f"**Title chosen:** {node_state.get('title')}\n\nReviewing lore and formatting markdown..."
                            step.name = "📜 Lore Penned"
                            await step.update()
                    elif node_name == "CharacterPortraitNode":
                        async with cl.Step(name="🎨 Conjuring portraits from the astral plane...", parent_id=parent_step.id) as step:
                            party = node_state.get('party_details')
                            if party:
                                party_dict = party if isinstance(party, dict) else party.model_dump()
                                chars = party_dict.get('characters', [])
                                if chars:
                                    count = sum(1 for c in chars if c.get('image_base64') and c.get('image_base64') != "[GENERATED IMAGE STORED]")
                                    if count > 0:
                                        step.output = f"✨ Successfully conjured {count} portraits!"
                                    else:
                                        step.output = "The magic faded. No portraits were conjured."
                            step.name = "🎨 Portraits Conjured"
                            await step.update()

                    final_state.update(node_state)

            parent_step.name = "🐉 Campaign successfully forged!"
            await parent_step.update()

        formatted_output, images = format_campaign_output(final_state)
        if "party_details" in final_state and "characters" in final_state.get("party_details", {}):
            state["characters"] = final_state["party_details"]["characters"]
            cl.user_session.set("campaign_params", state)

        chat_history = cl.user_session.get("chat_history", [])
        chat_history.append(AIMessage(content="Campaign generated successfully."))
        cl.user_session.set("chat_history", chat_history)

        await cl.Message(content=formatted_output, elements=images).send()

    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(error_details)
        await cl.Message(content=f"**Error resuming campaign:** {str(e)}\n\n```text\n{error_details}\n```").send()


def format_campaign_output(result: dict) -> str:
    title = result.get('title', 'Epic Adventure')
    description = result.get('description', 'An exciting adventure awaits!')
    background = result.get('background', 'The story begins...')
    rewards = result.get('rewards', 'Glory and treasure!')
    terrain = result.get('terrain', 'Unknown')
    difficulty = result.get('difficulty', 'Unknown')
    
    # Safely extract DM Notes
    plan = result.get('campaign_plan')
    if plan:
        villain = plan.get('primary_antagonist', 'Unknown') if isinstance(plan, dict) else getattr(plan, 'primary_antagonist', 'Unknown')
        conflict = plan.get('core_conflict', description) if isinstance(plan, dict) else getattr(plan, 'core_conflict', description)
        plot_points = plan.get('plot_points', []) if isinstance(plan, dict) else getattr(plan, 'plot_points', [])
        locations = plan.get('key_locations', []) if isinstance(plan, dict) else getattr(plan, 'key_locations', [])
        factions = plan.get('factions_involved', []) if isinstance(plan, dict) else getattr(plan, 'factions_involved', [])
        villain_statblock = plan.get('villain_statblock') if isinstance(plan, dict) else getattr(plan, 'villain_statblock', None)
    else:
        villain, conflict, plot_points, locations, factions, villain_statblock = "Unknown", description, [], [], [], None

    lines = []
    
    # --- 1. CAMPAIGN HEADER ---
    lines.append(f"# 🐉 {title}")
    lines.append(f"> *\"{description}\"*")
    lines.append("")
    lines.append(f"**🗺️ {terrain.title()}** ｜ **☠️ {difficulty.title()}**")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("### ⚔️ Core Conflict")
    lines.append(conflict)
    lines.append("")
    lines.append("### 📜 Background Lore")
    lines.append(background)
    lines.append("")
    lines.append("### 😈 Primary Antagonist")
    lines.append(f"**{villain}**")
    if villain_statblock:
        vs = villain_statblock
        # Handle both dict (from state dump) and Pydantic object
        hp = vs.get('hp') if isinstance(vs, dict) else getattr(vs, 'hp', None)
        ac = vs.get('ac') if isinstance(vs, dict) else getattr(vs, 'ac', None)
        quote = vs.get('flavor_quote') if isinstance(vs, dict) else getattr(vs, 'flavor_quote', None)
        attacks = vs.get('attacks', []) if isinstance(vs, dict) else getattr(vs, 'attacks', [])
        abilities = vs.get('special_abilities', []) if isinstance(vs, dict) else getattr(vs, 'special_abilities', [])
        if quote:
            lines.append(f"*\"{quote}\"*")
        if hp and ac:
            lines.append(f"**HP:** {hp} | **AC:** {ac}")
        if attacks:
            lines.append("**Attacks:**")
            for atk in attacks:
                lines.append(f"- {atk}")
        if abilities:
            lines.append("**Special Abilities:**")
            for ab in abilities:
                lines.append(f"- {ab}")
        phys = vs.get('physical_description') if isinstance(vs, dict) else getattr(vs, 'physical_description', None)
        if phys:
            lines.append(f"\n> 🎨 *{phys}*")
    lines.append("")
    
    if plot_points:
        lines.append("### 📖 Plot Outline")
        for i, plot in enumerate(plot_points, 1):
            lines.append(f"{i}. {plot}")
        lines.append("")
        
    if factions:
        lines.append("### 🛡️ Factions Involved")
        for f in factions:
            lines.append(f"- {f}")
        lines.append("")
        
    if locations:
        lines.append("### 📍 Key Locations")
        for loc in locations:
            lines.append(f"- {loc}")
        lines.append("")
        
    lines.append("### 🏆 Rewards & Hooks")
    lines.append(rewards)
    lines.append("")
    lines.append("---")
    lines.append("")
    
    # --- 2. PARTY AND CHARACTERS ---
    party_data = result.get('party_details')
    party_dict = party_data if isinstance(party_data, dict) else (party_data.model_dump() if party_data else {})
    party_name = party_dict.get('party_name', 'The Nameless Heroes') if party_dict else 'The Nameless Heroes'
    
    images = []
    
    lines.append(f"## ⚔️ {party_name}")
    lines.append("")
    
    if party_dict and party_dict.get('characters'):
        characters = party_dict.get('characters', [])
        for i, char in enumerate(characters, 1):
            name = char.get('name', f'Hero {i}')
            race = char.get('race', 'Unknown')
            char_class = char.get('class_name', char.get('class', 'Adventurer'))
            level = char.get('level', 1)
            alignment = char.get('alignment', 'True Neutral')
            quote = char.get('flavor_quote', 'Lets roll for initiative!')
            
            # --- Added HP and AC ---
            hp = char.get('hp', 10)
            ac = char.get('ac', 10)
            
            # Character Header
            lines.append(f"### {name}")
            
            # --- Inline Image ---
            img_b64 = char.get('image_base64')
            if img_b64 and img_b64 != "[GENERATED IMAGE STORED]":
                import base64
                try:
                    img_bytes = base64.b64decode(img_b64)
                    slug_name = f"portrait-{i}"
                    images.append(cl.Image(name=slug_name, content=img_bytes, display="inline"))
                    lines.append(f"![{slug_name}]({slug_name})")
                    lines.append("")
                except Exception:
                    pass

            lines.append(f"**Level {level} {race} {char_class}** • *{alignment}* • **{hp} HP** • **{ac} AC**")
            lines.append(f"> \"{quote}\"")
            lines.append("")
            
            phys_desc = char.get('physical_description')
            if phys_desc:
                lines.append(f"> 🎨 *{phys_desc}*")
                lines.append("")
            
            # Render stats as Markdown table if they exist
            stats = char.get('ability_scores', {})
            if stats:
                lines.append("| STR | DEX | CON | INT | WIS | CHA |")
                lines.append("|-----|-----|-----|-----|-----|-----|")
                lines.append(f"| {stats.get('STR', 10)} | {stats.get('DEX', 10)} | {stats.get('CON', 10)} | {stats.get('INT', 10)} | {stats.get('WIS', 10)} | {stats.get('CHA', 10)} |")
                lines.append("")

            # Bulleted Traits & Narrative Hook
            if char.get('backstory_hook'): 
                lines.append(f"**Hook:** {char['backstory_hook']}")
                lines.append("")
            
            rp_traits = []
            if char.get('personality_traits'):
                pt = char['personality_traits']
                # Safely handle it whether the LLM returns a list or a single string
                pt_str = ", ".join(pt) if isinstance(pt, list) else str(pt)
                rp_traits.append(f"**Traits:** {pt_str}")
                
            if char.get('ideals'): 
                rp_traits.append(f"**Ideals:** {char['ideals']}")
            if char.get('bonds'): 
                rp_traits.append(f"**Bonds:** {char['bonds']}")
            if char.get('flaws'): 
                rp_traits.append(f"**Flaws:** {char['flaws']}")

            if rp_traits:
                lines.append(" • ".join(rp_traits))
                lines.append("")
            
            # Grouped Mechanics
            mechanics = []
            
            # Skills are now guaranteed to be a list by the Pydantic schema
            if char.get('skills'): 
                sk = char['skills']
                sk_str = ", ".join(sk) if isinstance(sk, list) else str(sk)
                mechanics.append(f"**Skills:** {sk_str}")
            
            # Weapons
            if char.get('weapons'):
                wpns = char['weapons']
                w_strs = []
                for w in wpns:
                    if isinstance(w, dict):
                        w_name = w.get('name', '').strip()
                        w_stats = w.get('stats', '').strip()
                        w_strs.append(f"{w_name} ({w_stats})" if w_stats else w_name)
                    elif isinstance(w, str):
                        w_strs.append(w)
                if w_strs:
                    mechanics.append(f"**Weapons:** {', '.join(w_strs)}")
                    
            # Spells
            if char.get('spells'):
                spls = char['spells']
                s_strs = []
                for s in spls:
                    if isinstance(s, dict):
                        s_name = s.get('name', '').strip()
                        s_level = s.get('level', 0)
                        s_desc = s.get('description', '').strip()
                        lvl_str = "Cantrip" if s_level == 0 else f"Level {s_level}"
                        s_strs.append(f"{s_name} [{lvl_str}]: {s_desc}")
                    elif isinstance(s, str):
                        s_strs.append(s)
                if s_strs:
                    mechanics.append(f"**Spells:**\n- " + "\n- ".join(s_strs))
            
            # The elif char.get('weapons'): block has been completely removed!
                
            # Inventory is now guaranteed to be a list
            if char.get('inventory'):
                inv = char['inventory']
                inv_str = ", ".join(inv) if isinstance(inv, list) else str(inv)
                mechanics.append(f"**Inventory:** {inv_str}")
            
            if mechanics:
                lines.append(" • ".join(mechanics))
            
            # Force paragraph break
            lines.append("") 
            lines.append("---")
            lines.append("")
            
    return "\n".join(lines), images

# --- Chainlit App ---
@cl.on_chat_start
async def on_chat_start():

    # Introduce Memory to the session to avoid expensive reruns
    cl.user_session.set("thread_id", str(uuid.uuid4()))

    cl.user_session.set("campaign_params", {
        "party_name": None, "party_size": None, "terrain": None, 
        "difficulty": None, "requirements": "", "characters": [], "roster_locked": True
    })
    cl.user_session.set("chat_history", [])

    settings = await cl.ChatSettings([
        TextInput(id = "party_name", label = "Party Name", placeholder = "The Nameless Heroes", tooltip = "What is the name of your adventuring party? Leave it empty if you'd like AI to come up with one."),
        Slider(id = "party_size", label = "Party Size", min = 1, max = 8, step = 1, initial = 4, tooltip = "Number of adventurers in the party. If you list specific characters, this will update to match that number."),
        Select(id = "terrain", label = "Terrain", values = ["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp", "Underdark"], initial_index=3),
        Select(id = "difficulty", label = "Difficulty", values = ["Easy", "Medium", "Hard", "Deadly"], initial_index=1),   
        TextInput(id="requirements", label="Additional Requirements", placeholder="Any specific plot points, character traits, or themes you want to include? e.g., Make the villian a vampire etc.or We want a heavy focus on puzzles", multiline=True)
    ]).send()
    

    actions = [
        cl.Action(
            name = "start_campaign_btn", 
            payload = {"start_campaign": True},
            label = "🎲 Start Campaign"
        )
    ]

    welcome_msg = """# 🐉 Welcome to the Guild! 🍻

Pull up a chair by the hearth! I'm your Assistant *to the* Regional Dungeon Master. Let's draft a legendary campaign step-by-step. 

**To forge your world, we need to lock in:**
* 🏰 **Party Name:** What is the title of your adventuring company?
* 👥 **Party Size:** How many brave souls are at the table?
* 🗺️ **Terrain:** Where does the journey begin? *(Arctic, Desert, or Forest, etc.)*
* ☠️ **Difficulty:** How perilous is the road ahead? *(Easy, Medium, Hard, or Deadly)*

**Choose your path:**
1. ⚙️ **The Artificer's Route:** Use the settings panel in the chat to tweak your parameters and add special requirements, then click **🎲 Start Campaign** below.
2. 🗣️ **The Bard's Route:** Just tell me your vision in the chat! ("Make a deadly swamp adventure for 4 players"), or ask me to randomize the rest.
"""
    await cl.Message(content = welcome_msg, actions = actions).send()

@cl.on_settings_update
async def setup_campaign_settings(settings:dict):
    state = cl.user_session.get("campaign_params")

    state["party_name"] = settings.get("party_name")
    state["party_size"] = settings.get("party_size")
    state["terrain"] = settings.get("terrain")
    state["difficulty"] = settings.get("difficulty")
    state["requirements"] = settings.get("requirements")

    cl.user_session.set("campaign_params", state)

    await cl.Message(
        content=f"⚙️ **Settings locked in:** A {settings['difficulty']} campaign in the {settings['terrain']} for {settings['party_size']} heroes. Just say 'Start' when you are ready!"
    ).send()

@cl.action_callback("start_campaign_btn")
async def start_campaign(action: cl.Action):
    await action.remove()
    cl.user_session.set("pending_plan", None) # Clear any old plans
    state = cl.user_session.get("campaign_params", {})
    await run_planner_phase(state)

@cl.action_callback("approve_plan_btn")
async def approve_plan(action: cl.Action):
    await action.remove()
    await cl.Message(content="*Excellent! Rolling the dice and summoning your heroes...*").send()
    await resume_campaign()

@cl.action_callback("edit_plan_btn")
async def edit_plan(action: cl.Action):
    await action.remove()
    # Reset the thread so the planner re-runs from scratch with the edit
    import uuid
    cl.user_session.set("thread_id", str(uuid.uuid4()))
    await cl.Message(content="Of course! Tell me what you'd like to change — villain, plot, locations, difficulty — anything goes. I'll re-plan the campaign with your input.").send()

@cl.action_callback("dynamic_edit_btn")
async def dynamic_edit(action: cl.Action):
    await action.remove()
    edit_payload = action.payload.get("edit")
    
    # Show the user what they clicked
    await cl.Message(content=f"*{edit_payload}*").send()
    
    import uuid
    cl.user_session.set("thread_id", str(uuid.uuid4()))
    
    # Inject this edit into the state and run the planner again directly
    state = cl.user_session.get("campaign_params")
    state["requirements"] = f"{state.get('requirements', '')} {edit_payload}".strip()
    cl.user_session.set("campaign_params", state)
    
    await cl.Message(content="*Excellent choice. Re-weaving the threads of fate...*").send()
    await run_planner_phase(state)

@cl.on_message
async def on_message(message: cl.Message):
    user_text = message.content.strip()
    chat_history = cl.user_session.get("chat_history", [])
    
    if user_text.lower() in ['reset', 'start over', 'restart']:
        cl.user_session.set("campaign_params", {
            "party_name": None, "party_size": None, "terrain": None, 
            "difficulty": None, "requirements": "", "characters": [], "roster_locked": True
        })
        cl.user_session.set("chat_history", [])
        cl.user_session.set("pending_plan", None)
        await cl.Message(content="✨ Campaign parameters reset! Let's start fresh.").send()
        return

    state = cl.user_session.get("campaign_params")
    
    # Create the text history for the extractor
    history_str = "\n".join([f"{'User' if isinstance(m, HumanMessage) else 'AI'}: {m.content}" for m in chat_history[-4:]])
    if not history_str: history_str = "No previous history."

    extractor = extractor_model.with_structured_output(CampaignIntake)
    extraction_chain = EXTRACTOR_PROMPT | extractor
    
    extracted_data = await extraction_chain.ainvoke({
        "chat_history_text": history_str,
        "user_input": user_text
    })
    
    if extracted_data:
        if extracted_data.party_name: state["party_name"] = extracted_data.party_name
        if extracted_data.party_size: state["party_size"] = extracted_data.party_size
        if extracted_data.terrain: state["terrain"] = _coerce_terrain(extracted_data.terrain)
        if extracted_data.difficulty: state["difficulty"] = _coerce_difficulty(extracted_data.difficulty)
        if extracted_data.new_requirements:
            state["requirements"] = f"{state['requirements']} {extracted_data.new_requirements}".strip()
            
    cl.user_session.set("campaign_params", state)
    chat_history.append(HumanMessage(content=user_text))
    
    required_keys = ["party_name", "party_size", "terrain", "difficulty"]
    missing_keys = [k for k in required_keys if not state[k]]
    
    # Check trigger generation
    wants_to_generate = extracted_data.user_confirmed_start if extracted_data else False
  
    if not missing_keys or wants_to_generate:
        await run_planner_phase(state)

    else:
        current_state_str = "\n".join([f"- {k.replace('_', ' ').title()}: {v}" for k, v in state.items() if v and k in required_keys])
        missing_str = ", ".join(missing_keys).replace('_', ' ')
        
        response_chain = CONVERSATIONAL_PROMPT | chat_model
        ai_response = await response_chain.ainvoke({
            "current_state": current_state_str or "Nothing yet.",
            "missing_params": missing_str,
            "chat_history": chat_history[-4:], 
            "user_input": user_text
        })
        
        chat_history.append(AIMessage(content=ai_response.content))
        cl.user_session.set("chat_history", chat_history)
        
        await cl.Message(content=ai_response.content).send()