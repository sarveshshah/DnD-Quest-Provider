from contextlib import suppress
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator

from langchain_core.tools import tool, ToolException
from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.retrievers import WikipediaRetriever

import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_mcp_adapters.tools import load_mcp_tools
from langchain.agents import create_agent

from langgraph.checkpoint.memory import MemorySaver

from dotenv import load_dotenv
import sys

load_dotenv()

# Define model (Using Gemini 2.5 Pro or your preferred capable model)
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.2, # Low temperature for planning and extraction
    verbose=True
)

writer_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.7, # Higher temperature for creative writing
    verbose=True
)

# --- Schemas ---

class RouteDecision(BaseModel):
    target_node: Literal["PlannerNode", "PartyCreationNode", "NarrativeWriterNode"] = Field(
        description="The node to route the graph to based on the user's request."
    )

class CombatAction(BaseModel):
    name: str = Field(description="Name of attack or spell (e.g., Longsword, Fire Bolt)")
    stats: str = Field(description="MANDATORY COMBAT MATH. You MUST calculate and write the to-hit bonus and damage dice based on their ability scores (e.g., '+5 to hit | 1d8+3 Slashing'). DO NOT leave this blank.")

class Character(BaseModel):
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

    # Combat & Abilities
    hp: int = Field(description="Max hit points calculated for their level and class")
    ac: int = Field(description="Armor Class based on their gear")

    combat_actions: list[CombatAction] = Field(
        default_factory=list, 
        description="List of equipped weapons or offensive spells. MUST include the name and calculated stats (e.g., '+5 to hit | 1d8+3 Slashing')."
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
    party_name: str = Field(description="Name of the party")
    party_size: int = Field(description="Number of players in the party", ge=1)
    characters: list[Character] = Field(default_factory=list)

class CampaignPlan(BaseModel):
    """The structured facts of the campaign before writing begins."""
    thought_process: str = Field(description="Briefly explain your reasoning for the antagonist, plot, and locations based on the user's requirements.")
    primary_antagonist: str = Field(description="Name and brief concept of the main boss/villain")
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
    """Node 2: Builds the party based on the campaign plan."""
    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    existing_characters = state.party_details.characters if state.party_details else []
    plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."

    server_params = StdioServerParameters(
        command=sys.executable,
        args=["dnd-mcp/dnd_mcp_server.py"]
    )

    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # Load MCP Tools
            mcp_tools = await load_mcp_tools(session)

            research_prompt = f"""You are a D&D Rules Expert.
            Campaign Plan: {plan_context}
            Party Size: {party_size}
            Existing Characters: {existing_characters}
            Requirements: {state.requirements}

            Use your tools to look up exact starting gear, spells, and stats for this party.
            Provide a detailed text summary of each character including combat bonuses."""

            research_agent = create_agent(
                model = model,
                tools = mcp_tools,
                system_prompt = research_prompt
            )

            research_result = await research_agent.ainvoke({
                "message": [("user", "Research the exact starting stats, gear, and spells for each character based on their class and level. Provide a detailed text summary of each character including combat bonuses.")]
            })

            research_facts = research_result["messages"][-1].content
            print(research_facts)

    extraction_prompt = f"""
    Convert these D&D character facts into the required JSON schema.
    Maintain all weapon math and spell details exactly.
    
    Data: {research_facts}
    """

    structured_llm = model.with_structured_output(PartyDetails)
    new_party_details = structured_llm.invoke(extraction_prompt)
    
    # Standard cleanup
    new_party_details.party_name = party_name
    new_party_details.party_size = party_size
    new_party_details.characters = new_party_details.characters[:party_size]
    
    return {"party_details": new_party_details.model_dump(by_alias=True)}

            
    # plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."

    # prompt = prompt = f"""You are a D&D Party Architect. Create or edit a party for this specific campaign plan:
    # {plan_context}

    # Party Name: {party_name}
    # Target Size: {party_size}
    # User Requirements (May contain edit requests): {state.requirements or 'None'}
    
    # Current Party Roster:
    # {existing_characters}

    # CRITICAL CHARACTER CREATION RULES:
    # 1. READ THE USER REQUIREMENTS CAREFULLY. If the user asks to edit, rename, or change an existing character, you MUST apply those changes!
    # 2. Output the COMPLETE party roster of {party_size} characters. Copy any unedited characters exactly as they were, and include your modified characters or new additions.
    # 3. COMBAT MATH: You MUST calculate accurate 'to-hit' bonuses, damage, or Spell Save DCs for every item in the `weapons` and `spells` lists. 
    # 4. MAGIC USERS ONLY: If a character's class does not use magic, leave their `spells` list completely empty.
    # """

    # structured_llm = model.with_structured_output(PartyDetails)
    # new_party_details = structured_llm.invoke(prompt)
    
    # new_party_details.party_name = party_name
    # new_party_details.party_size = party_size

    # new_party_details.characters = new_party_details.characters[:party_size]
    # while len(new_party_details.characters) < party_size:
    #     new_party_details.characters.append(
    #         Character(name=f"TBD Adventurer {len(new_party_details.characters) + 1}", race="Unknown", class_name="Adventurer", level=1)
    #     )
    
    # return {"party_details": new_party_details.model_dump(by_alias=True)}

def narrative_writer_node(state: CampaignState):
    """Node 3: Takes the structured facts and writes the final, high-quality Markdown prose."""
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
    - "NarrativeWriterNode": If they just want to change the tone of the writing, or if no specific edits were requested.
    """

    decision = model.with_structured_output(RouteDecision).invoke(prompt)
    return decision.target_node

# --- Graph Construction ---
campaign_graph = StateGraph(CampaignState)

campaign_graph.add_node("PlannerNode", planner_node)
campaign_graph.add_node("PartyCreationNode", party_creation_node)
campaign_graph.add_node("NarrativeWriterNode", narrative_writer_node)

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

# Sequential steps after the initial routing
campaign_graph.add_edge("PlannerNode", "PartyCreationNode")
campaign_graph.add_edge("PartyCreationNode", "NarrativeWriterNode")
campaign_graph.add_edge("NarrativeWriterNode", END)   

memory = MemorySaver()
app = campaign_graph.compile(checkpointer=memory)

def main():
    """Test the campaign generator"""
    initial_state = CampaignState(
        terrain="Mountain",
        difficulty="hard",
        requirements="I want a quest involving a stolen dragon egg and a cult of ice monks.",
        party_details=PartyDetails(party_name="The Frozen Few", party_size=3)
    )
    final_state = app.invoke(initial_state)
    print(f"Generated Campaign: {final_state.get('title')}")
    print("Plan:", final_state.get('campaign_plan'))

if __name__ == "__main__":
    main()