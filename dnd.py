from contextlib import suppress
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

from langchain_core.tools import tool, ToolException
from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.retrievers import WikipediaRetriever

from dotenv import load_dotenv
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

class Character(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(description="Character name")
    race: str = Field(description="Character race")
    class_name: str = Field(alias="class", description="Character class")
    level: int = Field(description="Character level", ge=1)
    backstory_hook: Optional[str] = Field(default=None, description="Short backstory hook")
    personality_traits: list[str] = Field(default_factory=list, description="Key personality traits")
    ideals: Optional[str] = Field(default=None, description="Ideals that drive the character")
    bonds: Optional[str] = Field(default=None, description="Important bonds or connections")
    flaws: Optional[str] = Field(default=None, description="Notable flaws")
    inventory: Optional[str] = Field(default=None, description="Key items or equipment")
    weapons: Optional[str] = Field(default=None, description="Primary weapons")
    skills: Optional[str] = Field(default=None, description="Notable skills")

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
    difficulty: Optional[Literal["easy", "medium", "hard", "deadly"]] = None
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

# --- Helper Functions ---

def _normalize_name(name: str) -> str:
    return name.strip().lower()

def _merge_characters(existing: list[Character], generated: list[Character], party_size: int, roster_locked: bool) -> list[Character]:
    merged: list[Character] = []
    seen: set[str] = set()

    def add_chars(chars: list[Character]) -> None:
        for character in chars:
            key = _normalize_name(character.name)
            if key and key not in seen:
                merged.append(character)
                seen.add(key)

    if roster_locked:
        add_chars(existing)
        add_chars(generated)
    else:
        add_chars(generated)
        add_chars(existing)

    if len(merged) > party_size:
        merged = merged[:party_size]

    while len(merged) < party_size:
        merged.append(Character(name=f"TBD Adventurer {len(merged) + 1}", race="Unknown", class_name="Adventurer", level=1))

    return merged

# --- Nodes ---

def planner_node(state: CampaignState):
    """Node 1: Establishes the facts and structured outline of the campaign."""
    search_query = f"D&D quest ideas for a {state.difficulty or 'medium'} campaign in {state.terrain or 'mixed terrain'}"
    
    with suppress(ToolException, ValueError, TypeError):
        search_results = search_internet.invoke({"query": search_query})
    with suppress(ToolException, ValueError, TypeError):
        wiki_results = search_wikipedia.invoke({"query": search_query})

    prompt = f"""You are a D&D Campaign Architect. Your job is to create a logical, structured outline for a quest.
    DO NOT write the story yet. Only establish the facts.

    Constraints:
    - Terrain: {state.terrain}
    - Difficulty: {state.difficulty}
    - User Requirements: {state.requirements or 'None'}

    Reference Material:
    {search_results}
    {wiki_results}

    Analyze the requirements and create a strict CampaignPlan. Ensure the boss, plot points, and locations make sense together.
    """
    structured_llm = model.with_structured_output(CampaignPlan)
    plan = structured_llm.invoke(prompt)
    
    return {"campaign_plan": plan}

def party_creation_node(state: CampaignState):
    """Node 2: Builds the party based on the campaign plan."""
    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    existing_characters = state.party_details.characters if state.party_details else []
    remaining_slots = max(party_size - len(existing_characters), 0)
    roster_locked = state.roster_locked

    plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."

    prompt = f"""You are a D&D Party Architect. Create or fill out a party for this specific campaign plan:
    {plan_context}

    Party Name: {party_name}
    Target Size: {party_size}
    Slots to generate: {remaining_slots}
    Roster Locked: {roster_locked}
    User Requirements: {state.requirements or 'None'}
    
    Existing Characters (Do not alter if Roster Locked is True):
    {existing_characters}

    CRITICAL CHARACTER CREATION RULES:
    1. READ THE USER REQUIREMENTS CAREFULLY. If the user asks to play as specific existing fictional characters, celebrities, or pop-culture icons (e.g., "Luke Skywalker", "Sherlock Holmes"), YOU MUST USE THEIR EXACT NAMES. Do not rename them.
    2. Adapt these requested characters into the 5e D&D ruleset (e.g., Luke as a Psi Warrior Fighter or Paladin, Sherlock as an Inquisitive Rogue).
    3. For any remaining empty slots, generate unique, original characters that fit the campaign theme to reach the Target Size of {party_size}.
    """

    structured_llm = model.with_structured_output(PartyDetails)
    new_party_details = structured_llm.invoke(prompt)
    
    new_party_details.party_name = party_name
    new_party_details.party_size = party_size
    new_party_details.characters = _merge_characters(
        existing_characters,
        new_party_details.characters,
        party_size,
        roster_locked
    )
    
    return {"party_details": new_party_details.model_dump(by_alias=True)}

def narrative_writer_node(state: CampaignState):
    """Node 3: Takes the structured facts and writes the final, high-quality Markdown prose."""
    plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."
    party_context = state.party_details.model_dump_json(indent=2, by_alias=True) if state.party_details else "No party details."

    prompt = f"""You are an elite Dungeon Master and fantasy author. 
    Your job is to take the following dry Campaign Plan and Party Details, and write the final, evocative campaign prose.

    Campaign Plan (The Facts):
    {plan_context}

    The Party:
    {party_context}

    Difficulty: {state.difficulty}
    Terrain: {state.terrain}

    Guidelines:
    - Write in an engaging, cinematic style.
    - The "description" should be thrilling and set the stakes.
    - The "background" should cover the lore and how the core conflict came to be.
    - Make sure the prose strictly adheres to the facts in the Campaign Plan. Do not hallucinate new major villains or locations.
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

# --- Graph Construction ---

campaign_graph = StateGraph(CampaignState)

campaign_graph.add_node("PlannerNode", planner_node)
campaign_graph.add_node("PartyCreationNode", party_creation_node)
campaign_graph.add_node("NarrativeWriterNode", narrative_writer_node)

campaign_graph.add_edge(START, "PlannerNode")
campaign_graph.add_edge("PlannerNode", "PartyCreationNode")
campaign_graph.add_edge("PartyCreationNode", "NarrativeWriterNode")
campaign_graph.add_edge("NarrativeWriterNode", END)   

app = campaign_graph.compile()

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