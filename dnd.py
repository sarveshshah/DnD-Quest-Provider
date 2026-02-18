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

# define model
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0
)


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
    inventory: Optional[str] = Field(default=None, description="Key items or equipment the character carries")
    weapons: Optional[str] = Field(default=None, description="Primary weapons used by the character")
    skills: Optional[str] = Field(default=None, description="Notable skills or proficiencies")

class PartyDetails(BaseModel):
    # Party Information
    party_name: str = Field(description="Name of the party")
    party_size: int = Field(description="Number of players in the party", ge=1)
    party_level: list[dict[str, int]] = Field(
        default_factory=list,
        description="List of party members with their levels"
    )
    characters: list[Character] = Field(
        default_factory=list,
        description=(
            "Unique character roster with keys like name, race, class, level, personality_traits, ideals, bonds, flaws,"
            "backstory_hook, inventory, weapons, and skills"
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
    requirements: Optional[str] = Field(default=None, description="Player requirements and narrative constraints")
    roster_locked: bool = Field(default=True, description="Whether existing characters are locked and must be preserved")

    party_details: Optional[PartyDetails] = Field(None, description="Details of the party for the campaign")


def dungeon_master_agent(state: CampaignState):
    """Agent function to create a Dungeons and Dragons campaign based on the provided state."""

    party_context = (
        state.party_details.model_dump_json(indent=2, by_alias=True)
        if state.party_details
        else "No party details provided."
    )
    search_query = (
        f"D&D quest ideas for a {state.difficulty or 'medium'} campaign "
        f"in {state.terrain or 'mixed terrain'}"
    )
    search_results = "No external references available."
    with suppress(ToolException, ValueError, TypeError):
        search_results = search_internet.invoke({"query": search_query})

    wiki_results = "No Wikipedia references available."
    with suppress(ToolException, ValueError, TypeError):
        wiki_results = search_wikipedia.invoke({"query": search_query})



    prompt = f"""You are a dungeon master for a Dungeons and Dragons game. 
    Create a Dungeons and Dragons campaign based on the following information:

    Party Details:
    {party_context}

    Reference Search Results:
    {search_results}

    Wikipedia References:
    {wiki_results}



    Player Requirements:
    {state.requirements or 'No additional requirements provided.'}

    The campaign should include
        Campaign Title
        Campaign Description
        Campaign Background Story
        Terrain Type
        Rewards

    The campaign should be creative and immersive, providing an engaging experience for the players.
    Respect all player requirements exactly, including named characters and any villain constraints.
    Return output that matches the CampaignState schema.
    """
    structured_llm_response = model.with_structured_output(CampaignState)
    response = structured_llm_response.invoke(prompt)
    campaign_state = response if isinstance(response, CampaignState) else CampaignState.model_validate(response)

    if state.party_details and not campaign_state.party_details:
        campaign_state.party_details = state.party_details

    return campaign_state.model_dump(by_alias=True)


@tool
def search_internet(query: str) -> str:
    """Tool function to search the internet for information related to the Dungeons and Dragons campaign."""
    # Implement internet search logic here (e.g., using an API or web scraping)
    search_tool = DuckDuckGoSearchResults()
    results = search_tool.invoke(query)
    return results

@tool
def search_wikipedia(query: str) -> str:
    """Tool function to pull brief references from Wikipedia for inspiration."""
    retriever = WikipediaRetriever(top_k_results=3, doc_content_chars_max=1200)
    docs = retriever.invoke(query)
    if not docs:
        return "No Wikipedia results found."

    formatted = []
    for doc in docs:
        title = doc.metadata.get("title", "Unknown")
        snippet = doc.page_content.strip()
        formatted.append(f"Title: {title}\nSummary: {snippet}")

    return "\n\n".join(formatted)




def _normalize_name(name: str) -> str:
    return name.strip().lower()


def _merge_characters(
    existing: list[Character],
    generated: list[Character],
    party_size: int,
    roster_locked: bool
) -> list[Character]:
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
        merged.append(
            Character(
                name=f"TBD Adventurer {len(merged) + 1}",
                race="Unknown",
                class_name="Adventurer",
                level=1
            )
        )

    return merged

def party_creation_agent(state: CampaignState):
    """Agent function to create a party for the Dungeons and Dragons campaign."""

    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    existing_characters = state.party_details.characters if state.party_details else []
    remaining_slots = max(party_size - len(existing_characters), 0)
    roster_locked = state.roster_locked if state.roster_locked is not None else True

    search_queries = [
        f"D&D unique party composition ideas for {max(remaining_slots, 1)} players",
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

    wiki_query = f"fantasy archetypes and character tropes {state.terrain or ''}".strip()
    wiki_results = "No Wikipedia references available."
    with suppress(ToolException, ValueError, TypeError):
        wiki_results = search_wikipedia.invoke({"query": wiki_query})



    prompt = f"""Create a party for a Dungeons and Dragons campaign. 

    Use the name {party_name} if provided, otherwise generate a random name for the party. 
    The party should also include playable characters along with their races and classes.
    Preserve existing characters and only create {remaining_slots} new characters to reach a total of {party_size}.
    Existing characters:
    {existing_characters}
    Roster locked: {roster_locked}
    Use these references when useful:
    {search_results}

    Wikipedia References:
    {wiki_results}



    Player Requirements:
    {state.requirements or 'No additional requirements provided.'}
    Party should be creative and interesting, providing a diverse set of characters that are balanced and suitable for the campaign
    .
    Each character must be original (do not copy exact characters or names from sources), but may be inspired by themes from references.
    If the requirements list specific characters, include them exactly and count them toward the party size.
    Fill the remaining slots with thematically consistent characters.
    If roster_locked is true, do not change existing characters; only add new ones.
    Return the roster in `characters` using keys: name, race, class, level, backstory_hook,
    personality_traits, ideals, bonds, flaws, inventory, weapons, skills.
    Use Campaign information {state} if needed to create a party that fits well with the campaign setting and difficulty level.
    Return output that matches the PartyDetails schema.
    """
    structured_llm_response = model.with_structured_output(PartyDetails)
    response = structured_llm_response.invoke(prompt)
    party_details = response if isinstance(response, PartyDetails) else PartyDetails.model_validate(response)
    party_details.party_name = party_name
    party_details.party_size = party_size
    party_details.characters = _merge_characters(
        existing_characters,
        party_details.characters,
        party_size,
        roster_locked
    )
    return {"party_details": party_details.model_dump(by_alias=True)}


# Create a state graph for the Dungeons and Dragons campaign generator
campaign_graph = StateGraph(CampaignState)
campaign_graph.add_node("PartyCreationAgent", party_creation_agent)
campaign_graph.add_node("DungeonMasterAgent", dungeon_master_agent)
campaign_graph.add_edge(START, "PartyCreationAgent")
campaign_graph.add_edge("PartyCreationAgent", "DungeonMasterAgent")
campaign_graph.add_edge("DungeonMasterAgent", END)   

app = campaign_graph.compile()

def main():
    """Test the campaign generator"""
    initial_state = CampaignState()
    final_state = app.invoke(initial_state)
    print("Generated Dungeons and Dragons Campaign:")
    print(final_state)

if __name__ == "__main__":
    main()
