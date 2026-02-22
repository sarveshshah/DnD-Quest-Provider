from contextlib import suppress, asynccontextmanager
from typing import Optional, Literal, Annotated, Any
from pydantic import BaseModel, Field, ConfigDict
import operator

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode, tools_condition

from langchain_core.tools import tool, ToolException
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.retrievers import WikipediaRetriever

import asyncio
import traceback
import sys

from mcp.client.sse import sse_client
from mcp.client.session import ClientSession

@asynccontextmanager
async def mcp_server_session():
    """Reusable context manager for MCP tool connections."""
    mcp_tools = []
    try:
        async with sse_client("http://localhost:8000/sse") as session_streams:
            async with ClientSession(session_streams[0], session_streams[1]) as session:
                await session.initialize()
                mcp_tools = await load_mcp_tools(session)
                yield mcp_tools
    except ExceptionGroup:
        pass # Ignore TaskGroup teardown errors from SSE client
    except Exception as e:
        print(f"MCP Connection Error: {e}", file=sys.stderr)
    finally:
        # Fallback yield just in case the exception was caught before the primary yield
        if not mcp_tools:
            yield mcp_tools

from dotenv import load_dotenv
load_dotenv()

# Define model (Using Gemini 3.1 Pro or your preferred capable model)
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.2, # Low temperature for planning and extraction
    verbose=False
)

writer_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.7, # Higher temperature for creative writing
    verbose=False
)

# --- Schemas ---
class RouteDecision(BaseModel):
    """Determines which node to route to based on the user's latest request"""
    target_node: Literal["PlannerNode", "PartyCreationNode", "NarrativeWriterNode"] = Field(
        description="The node to route the graph to based on the user's request."
    )

class Weapon(BaseModel):
    """Weapon represents an equipped weapon, including the necessary combat math."""
    name: str = Field(description="Name of weapon (e.g., Longsword, Dagger)")
    stats: str = Field(description="MANDATORY COMBAT MATH. You MUST calculate and write the to-hit bonus and damage dice based on their ability scores (e.g., '+5 to hit | 1d8+3 Slashing'). DO NOT leave this blank.")

class Spell(BaseModel):
    """Spell represents an equipped or known spell."""
    name: str = Field(description="Name of the spell (e.g., Fire Bolt, Cure Wounds)")
    level: int = Field(description="Spell level (0 for cantrips)")
    description: str = Field(description="Brief spell effect, including damage/healing or save DC if applicable.")

class VillainStatblock(BaseModel):
    """Stats and abilities of the primary antagonist."""
    hp: int = Field(description="Max hit points")
    ac: int = Field(description="Armor Class")
    flavor_quote: str = Field(description="A menacing, in-character quote from the villain")
    physical_description: str = Field(description="A vivid, detailed physical description of the villain's appearance. Include height, build, distinctive features, clothing, and any unnatural traits. This will be used for image generation.")
    attacks: list[str] = Field(description="List of attacks with to-hit and damage (e.g., '+7 to hit | 2d8+4 slashing')")
    special_abilities: list[str] = Field(default_factory=list, description="Unique villain abilities or legendary actions")

class Character(BaseModel):
    """Character schema with detailed attributes, personality, combat stats, and inventory."""
    # Basic Attributes
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(description="Character name")
    race: str = Field(description="Character race")
    class_name: str = Field(alias="class", description="Character class")
    level: int = Field(description="Character level", ge=1)

    # Personality & Backstory
    backstory_hook: Optional[str] = Field(default=None, description="Short backstory hook")
    personality_traits: list[str] = Field(default_factory=list, description="Key personality traits")
    ideals: Optional[str] = Field(default=None, description="Ideals that drive the character")
    bonds: Optional[str] = Field(default=None, description="Important bonds or connections")
    flaws: Optional[str] = Field(default=None, description="Notable flaws")
    alignment: str = Field(description="D&D alignment (e.g., Chaotic Good, Lawful Evil)")
    flavor_quote: str = Field(description="A short, in-character quote that sums up their personality")
    physical_description: str = Field(description="A vivid, detailed physical description of the character's appearance. Include race features, build, hair, eyes, clothing, and any notable markings or gear. This will be used for image generation.")

    # Combat & Abilities
    hp: int = Field(description="Max hit points calculated for their level and class")
    ac: int = Field(description="Armor Class based on their gear")

    weapons: list[Weapon] = Field(
        default_factory=list, 
        description="List of equipped weapons. MUST include the name and calculated stats (e.g., '+5 to hit | 1d8+3 Slashing')."
    )
    
    spells: list[Spell] = Field(
        default_factory=list,
        description="List of known spells. Empty for martial classes."
    )
    
    ability_scores: dict[str, int] = Field(description="A dictionary of standard D&D stats (STR, DEX, CON, INT, WIS, CHA) generated using standard array or point buy.")
    
    skills: list[str] = Field(
        default_factory=list, 
        description="List of proficient skills with their total bonus (e.g., 'Arcana +7', 'Stealth +5')"
    )
    # Items
    inventory: list[str] = Field(
        default_factory=list, 
        description="Key items, adventuring gear, or trinkets (Do not include equipped weapons here)"
    )

class PartyDetails(BaseModel):
    """Details about the party, including its name, size, and characters."""
    party_name: str = Field(description="Name of the party")
    party_size: int = Field(description="Number of players in the party", ge=1)
    characters: list[Character] = Field(default_factory=list)

class CampaignPlan(BaseModel):
    """The structured facts of the campaign before writing begins."""
    thought_process: str = Field(description="Briefly explain your reasoning for the antagonist, plot, and locations based on the user's requirements.")
    primary_antagonist: str = Field(description="Name and brief concept of the main boss/villain")
    villain_statblock: VillainStatblock = Field(description="Combat stats for the primary antagonist")
    core_conflict: str = Field(description="One sentence summarizing the main problem")
    plot_points: list[str] = Field(description="3 to 4 major events that will happen in the quest")
    factions_involved: list[str] = Field(description="1 or 2 local factions or guilds involved in the conflict")
    key_locations: list[str] = Field(description="Specific areas within the terrain the party will visit")
    loot_concept: str = Field(description="The general idea for the final reward")

class CampaignContent(BaseModel):
    """The final generated prose."""
    title: str = Field(description="Epic campaign title")
    description: str = Field(description="Exciting campaign description (2-3 paragraphs)")
    background: str = Field(description="Campaign background story and lore")
    rewards: str = Field(description="Specific details of the glory and treasure")

class CampaignState(BaseModel):
    """The unified state passed through the LangGraph."""

    # Message History
    messages: Annotated[list[BaseMessage], operator.add] = Field(default_factory=list)

    # Inputs
    terrain: Optional[Literal["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp", "Underdark"]] = None
    difficulty: Optional[Literal["Easy", "Medium", "Hard", "Deadly"]] = None
    requirements: Optional[str] = None
    roster_locked: bool = True
    
    # State Accumulators
    party_details: Optional[PartyDetails] = None
    campaign_plan: Optional[CampaignPlan] = None
    
    # Final Outputs (Expected by app.py)
    title: Optional[str] = None
    description: Optional[str] = None
    background: Optional[str] = None
    rewards: Optional[str] = None

# --- Tools ---
@tool
def search_internet(query: str) -> str:
    """Search the internet for D&D campaign inspiration."""
    search_tool = DuckDuckGoSearchResults()
    return search_tool.invoke(query)

@tool
def search_wikipedia(query: str) -> str:
    """Pull brief references from Wikipedia for fantasy inspiration."""
    retriever = WikipediaRetriever(top_k_results=2, doc_content_chars_max=1000)
    docs = retriever.invoke(query)
    if not docs:
        return "No Wikipedia results found."
    return "\n\n".join([f"Title: {doc.metadata.get('title', 'Unknown')}\nSummary: {doc.page_content.strip()}" for doc in docs])

# --- Nodes ---
def planner_node(state: CampaignState):
    """Node 1: Establishes the facts and structured outline of the campaign."""
    search_query = f"D&D quest ideas for a {state.difficulty or 'Medium'} campaign in {state.terrain or 'Mixed Terrain'}"
    
    search_results = "No internet search results."
    wiki_results = "No Wikipedia results."
    
    with suppress(ToolException, ValueError, TypeError):
        search_results = search_internet.invoke({"query": search_query})
    with suppress(ToolException, ValueError, TypeError):
        wiki_results = search_wikipedia.invoke({"query": search_query})

    # Grab existing plan if it exists
    existing_plan = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan exists yet."

    prompt = f"""You are a D&D Campaign Architect. Your job is to create a logical, structured outline for a quest.
    DO NOT write the story yet. Only establish the facts.

    Constraints:
    - Terrain: {state.terrain}
    - Difficulty: {state.difficulty}
    - User Requirements: {state.requirements or 'None'}

    ### EXISTING PLAN (Reference for Edits) ###
    {existing_plan}

    Reference Material:
    {search_results}
    {wiki_results}

    Analyze the requirements and create a strict CampaignPlan. Ensure the boss, plot points, and locations make sense together.

    CRITICAL RULES:
    1. EDITING MODE: If an "Existing Plan" is provided, ONLY modify the specific elements requested (e.g., changing a name). 
    2. THE COPY-PASTE MANDATE: For every field NOT requested to change, copy the content EXACTLY from the Existing Plan. Do not paraphrase or "improve" it.
    3. COLD START: If no Existing Plan is provided, create a brand new CampaignPlan from scratch.
    """
    structured_llm = model.with_structured_output(CampaignPlan)
    plan = structured_llm.invoke(prompt)
    
    return {"campaign_plan": plan}

async def party_creation_node(state: CampaignState):
    """Node 2: Builds the party, potentially calling MCP tools if needed."""
    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    existing_characters = state.party_details.characters if state.party_details else []
    plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."

    mcp_tools = []
    async with mcp_server_session() as tools:
        if tools:
            mcp_tools = tools

    # Bind the MCP tools to our model outside the SSE context!
    model_with_tools = model.bind_tools(mcp_tools) if mcp_tools else model

    system_prompt = f"""You are a master D&D Party Architect and Rules Expert.
    Campaign World Context: {plan_context}
    Party Name: {"Generate an epic, creative name fitting the lore" if party_name == "Not Provided" else party_name}
    Party Size: {party_size}
    Existing Characters: {existing_characters}
    Requirements: {state.requirements}
    
    CRITICAL TOOL & CREATIVITY MANDATE:
    1. Use your MCP tools (like 'get_class_starting_equipment', 'filter_spells_by_level', etc.) to research accurate starting gear and spells for these characters.
    2. GO BEYOND STATS: Tie their backstories, ideals, and bonds directly into the Campaign World Context. Why are they involved in this specific conflict?
    3. Generate a highly creative and unique `flavor_quote` for each character based on their quirks or gear.
    4. Calculate accurate combat stats ('to-hit' and 'damage') for all acquired weapons and spells based on their ability scores.
    """

    # Format messages
    if not state.messages:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content="Please research the exact starting stats, gear, and spells for each character based on their class and level.")
        ]
    else:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content="Please research the exact starting stats, gear, and spells for each character based on their class and level.")
        ] + state.messages

    print(f"DEBUG: Checking {len(state.messages) if state.messages else 0} messages.", file=sys.stderr)
    if state.messages:
        print(f"DEBUG: Last message type: {state.messages[-1].type}", file=sys.stderr)

    # Check if we just finished using tools
    just_finished_tools = False
    if state.messages and state.messages[-1].type == "tool":
        just_finished_tools = True

    # Generate!
    try:
        if just_finished_tools:
            # Force Pydantic output!
            structured_llm = model.with_structured_output(PartyDetails)
            final_party = await structured_llm.ainvoke(messages)
            
            # Standard cleanup
            if party_name != "Not Provided":
                final_party.party_name = party_name
                
            final_party.party_size = party_size
            final_party.characters = final_party.characters[:party_size]

            while len(final_party.characters) < party_size:
                final_party.characters.append(
                    Character(name=f"TBD Adventurer {len(final_party.characters) + 1}", race="Unknown", class_name="Adventurer", level=1)
                )
            
            return {
                "messages": [AIMessage(content="Generated final PartyDetails JSON.")],
                "party_details": final_party.model_dump(by_alias=True)
            }
        else:
            # Let it decide whether to use tools or write text
            response = await model_with_tools.ainvoke(messages)
            return {"messages": [response]} 
    except Exception as e:
        print(f"Model Invocation Error: {e}", file=sys.stderr)
        return {"messages": [AIMessage(content="Tool connection failed, I will generate default characters.")]}

async def mcp_tool_node(state: CampaignState):
    result = None
    async with mcp_server_session() as mcp_tools:
        if mcp_tools:
            try:
                tool_executor = ToolNode(mcp_tools)
                result = await tool_executor.ainvoke(state)
            except Exception as e:
                print(f"Tool Execution Error: {e}", file=sys.stderr)
        
    if result is not None:
        return result
    return {"messages": []}

def narrative_writer_node(state: CampaignState):
    """Node 3: Takes the structured facts and writes the final, high-quality Markdown prose."""

    # Clear tools messages from previos node
    state.messages.clear()

    plan_context = state.campaign_plan.model_dump_json(indent = 2) if state.campaign_plan else "No plan available."
    party_context = state.party_details.model_dump_json(indent = 2, by_alias = True) if state.party_details else "No party details."

    existing_narrative = "None"
    if state.title:
        existing_narrative = f"Title: {state.title}\nDescription: {state.description}\nBackground: {state.background}\nRewards: {state.rewards}"

    prompt = f"""You are an elite Dungeon Master and fantasy author. 
    Your job is to take the following dry Campaign Plan and Party Details, and write the final, evocative campaign prose.

    Campaign Plan (The Facts):
    {plan_context}

    The Party:
    {party_context}

    Difficulty: {state.difficulty}
    Terrain: {state.terrain}

    Existing Prose:
    {existing_narrative}
    
    User Requirements (May contain edit requests): {state.requirements or 'None'}

    Guidelines:
    - Write in an engaging, cinematic style.
    - The "description" should be thrilling and set the stakes.
    - The "background" should cover the lore and how the core conflict came to be.
    - Make sure the prose strictly adheres to the facts in the Campaign Plan. Do not hallucinate new major villains or locations.

    CRITICAL EDITING RULES:
    1. If "Existing Prose" is provided, your job is to UPDATE it to reflect any changes in the Campaign Plan or User Requirements. 
    2. Keep the exact same tone, style, length, and structure as the Existing Prose. Do NOT rewrite the entire story from scratch. Only alter the specific words and sentences necessary to accommodate the new facts (like swapping out a villain's name).
    3. If no Existing Prose is provided, write it from scratch using an engaging, cinematic style.
    """
    
    # We use the higher temperature model here for better creative writing
    structured_writer = writer_model.with_structured_output(CampaignContent)
    content = structured_writer.invoke(prompt)
    
    return {
        "title": content.title,
        "description": content.description,
        "background": content.background,
        "rewards": content.rewards
    }

# Allow smart routing so that agent can call the right node
def route_step(state: CampaignState):
    """A simple router to determine which node to execute based on the current state."""
    if not state.campaign_plan:
        return "PlannerNode"
    if not state.party_details:
        return "PartyCreationNode"
    
    prompt = f"""Analyze the user's latest request: "{state.requirements}"
    
    Where should we route the graph?
    - "PlannerNode": If they want to change the plot, villain, setting, or core conflict.
    - "PartyCreationNode": If they want to change a character's name, race, class, stats, or party composition.
    - "NarrativeWriterNode": If they want to change the title, the tone of the writing, or if no specific edits were requested.
    """

    decision = model.with_structured_output(RouteDecision).invoke(prompt)
    return decision.target_node

def determine_next_steps(state: CampaignState, current_node: str):
    """Determine the next steps in the campaign generation process."""

    if current_node == "PlannerNode":
        return "PartyCreationNode"
    elif current_node == "PartyCreationNode":
        if not state.title:
            return "NarrativeWriterNode"
    
        prompt = f"""Did the user request a change to the story, narrative, or TITLE, or just character stats?

        User Request: {state.requirements}
        
        Respond with exactly ONE WORD:
        - "YES" if they explicitly asked for story/plot/narrative/title changes
        - "NO" if they only want character changes
        """


        wants_story = "YES" in model.invoke(prompt).content.upper()
        return "NarrativeWriterNode" if wants_story else END

    elif current_node == "NarrativeWriterNode":
        return END

    return END

# --- Graph Construction ---
campaign_graph = StateGraph(CampaignState)

campaign_graph.add_node("PlannerNode", planner_node)
campaign_graph.add_node("PartyCreationNode", party_creation_node)
campaign_graph.add_node("NarrativeWriterNode", narrative_writer_node)
campaign_graph.add_node("MCPToolNode", mcp_tool_node)

# Add conditional router to restart from where we left off
campaign_graph.add_conditional_edges(
    START, 
    route_step,
    {
        "PlannerNode": "PlannerNode",
        "PartyCreationNode": "PartyCreationNode",
        "NarrativeWriterNode": "NarrativeWriterNode"
    }
)

# Step 2: Dynamic Routing
campaign_graph.add_conditional_edges(
    "PlannerNode",
    lambda state: determine_next_steps(state, "PlannerNode"),
    {
        "PartyCreationNode": "PartyCreationNode",
        "NarrativeWriterNode": "NarrativeWriterNode",
        END: END
    }
)

def route_tools_or_continue(state: CampaignState):
    """Check if we should route to tools or continue to next step."""
    messages = state.messages
    if messages and isinstance(messages[-1], AIMessage) and messages[-1].tool_calls:
        return "tools"
    return "done"

# Step 3: Dynamic Routing
campaign_graph.add_conditional_edges(
    "PartyCreationNode",
    route_tools_or_continue,
    {
        "tools": "MCPToolNode",
        "done": "route_next"
    }
)

# A fake passthrough node just to let LangGraph compile the route_next edge
def dummy_route_node(state: CampaignState): return {"messages": []}
campaign_graph.add_node("route_next", dummy_route_node)
campaign_graph.add_conditional_edges("route_next", lambda state: determine_next_steps(state, "PartyCreationNode"), {"NarrativeWriterNode": "NarrativeWriterNode", END: END})

campaign_graph.add_edge("MCPToolNode", "PartyCreationNode")
campaign_graph.add_edge("NarrativeWriterNode", END)

memory = MemorySaver()
app = campaign_graph.compile(checkpointer=memory)

def main():
    """Test the campaign generator"""
    initial_state = CampaignState(
        terrain="Mountain",
        difficulty="Hard",
        requirements="I want a quest involving a stolen dragon egg and a cult of ice monks.",
        party_details=PartyDetails(party_name="The Frozen Few", party_size=3)
    )
    config = {"configurable": {"thread_id": "test_1"}}
    final_state = asyncio.run(app.ainvoke(initial_state, config))
    print(f"Generated Campaign: {final_state.get('title')}")
    print("Plan:", final_state.get('campaign_plan'))

if __name__ == "__main__":
    main()