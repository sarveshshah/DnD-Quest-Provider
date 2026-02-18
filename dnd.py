from contextlib import suppress
from typing import Optional, Literal
from pydantic import BaseModel, Field

from langchain_core.tools import tool, ToolException

from langgraph.graph import StateGraph, START, END
from langchain_google_genai import ChatGoogleGenerativeAI

from langchain_community.tools import DuckDuckGoSearchResults

from dotenv import load_dotenv
load_dotenv()

# define model
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0
)

class PartyDetails(BaseModel):
    # Party Information
    party_name: str = Field(description="Name of the party")
    party_size: int = Field(description="Number of players in the party", ge=1)
    party_level: list[dict[str, int]] = Field(
        default_factory=list,
        description="List of party members with their levels"
    )
    characters: list[dict[str, str | int]] = Field(
        default_factory=list,
        description=(
            "Unique character roster with keys like name, race, class, level, personality_traits, ideals, bonds, flaws,"
            "and backstory_hook"
        )
    )

class CampaignState(BaseModel):
    """Campaign State for Dungeons and Dragons Campaign"""
    title: Optional[str] = Field(default=None, description="Campaign title")
    description: Optional[str] = Field(default=None, description="Campaign description")
    background: Optional[str] = Field(default=None, description="Campaign background story")
    terrain: Optional[Literal["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp", "Underdark"]] = Field(
        default=None,
        description="Terrain type"
    )
    difficulty: Optional[Literal["easy", "medium", "hard", "deadly"]] = Field(
        default=None,
        description="Difficulty level"
    )
    rewards: Optional[str] = Field(default=None, description="Rewards")

    party_details: Optional[PartyDetails] = Field(None, description="Details of the party for the campaign")


def dungeon_master_agent(state: CampaignState):
    """Agent function to create a Dungeons and Dragons campaign based on the provided state."""

    party_context = state.party_details.model_dump_json(indent=2) if state.party_details else "No party details provided."
    search_query = (
        f"D&D quest ideas for a {state.difficulty or 'medium'} campaign "
        f"in {state.terrain or 'mixed terrain'}"
    )
    search_results = "No external references available."
    with suppress(ToolException, ValueError, TypeError):
        search_results = search_internet.invoke({"query": search_query})

    prompt = f"""You are a dungeon master for a Dungeons and Dragons game. 
    Create a Dungeons and Dragons campaign based on the following information:

    Party Details:
    {party_context}

    Reference Search Results:
    {search_results}

    The campaign should include
        Campaign Title
        Campaign Description
        Campaign Background Story
        Terrain Type
        Rewards

    The campaign should be creative and immersive, providing an engaging experience for the players.
    Return output that matches the CampaignState schema.
    """
    structured_llm_response = model.with_structured_output(CampaignState)
    response = structured_llm_response.invoke(prompt)
    campaign_state = response if isinstance(response, CampaignState) else CampaignState.model_validate(response)

    if state.party_details and not campaign_state.party_details:
        campaign_state.party_details = state.party_details

    return campaign_state.model_dump()


@tool
def search_internet(query: str) -> str:
    """Tool function to search the internet for information related to the Dungeons and Dragons campaign."""
    # Implement internet search logic here (e.g., using an API or web scraping)
    search_tool = DuckDuckGoSearchResults()
    results = search_tool.invoke(query)
    return results

def party_creation_agent(state: CampaignState):
    """Agent function to create a party for the Dungeons and Dragons campaign."""

    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    party_level = state.party_details.party_level if state.party_details else []

    search_queries = [
        f"D&D unique party composition ideas for {party_size} players",
        "D&D cool race and class combination ideas",
        f"fantasy character archetypes for {state.terrain or 'mixed terrain'} settings",
        "creative D&D backstory hooks for player characters"
    ]
    search_blurbs: list[str] = []
    for query in search_queries:
        with suppress(ToolException, ValueError, TypeError):
            results = search_internet.invoke({"query": query})
            if results:
                search_blurbs.append(f"Query: {query}\nResults: {results}")

    search_results = "\n\n".join(search_blurbs) if search_blurbs else "No external references available."

    prompt = f"""Create a party for a Dungeons and Dragons campaign. 

    Use the name {party_name} if provided, otherwise generate a random name for the party. 
    The party should also include playable characters along with their races and classes. Create characters for {party_size} 
    players with levels based on the provided information in {party_level}.
    Use these references when useful:
    {search_results}
    Party should be creative and interesting, providing a diverse set of characters that are balanced and suitable for the campaign
    .
    Each character must be original (do not copy exact characters or names from sources), but may be inspired by themes from references.
    Return the roster in `characters` using keys: name, race, class, level, backstory_hook.
    Use Campaign information {state} if needed to create a party that fits well with the campaign setting and difficulty level.
    Return output that matches the PartyDetails schema.
    """
    structured_llm_response = model.with_structured_output(PartyDetails)
    response = structured_llm_response.invoke(prompt)
    party_details = response if isinstance(response, PartyDetails) else PartyDetails.model_validate(response)
    return {"party_details": party_details.model_dump()}


# Create a state graph for the Dungeons and Dragons campaign generator
graph = StateGraph(CampaignState)
graph.add_node("PartyCreationAgent", party_creation_agent)
graph.add_node("DungeonMasterAgent", dungeon_master_agent)
graph.add_edge(START, "PartyCreationAgent")
graph.add_edge("PartyCreationAgent", "DungeonMasterAgent")
graph.add_edge("DungeonMasterAgent", END)   

app = graph.compile()

initial_state = CampaignState()
final_state = app.invoke(initial_state)
print("Generated Dungeons and Dragons Campaign:")
print(final_state)
