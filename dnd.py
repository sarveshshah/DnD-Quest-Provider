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
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, BaseMessage, ToolMessage

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.retrievers import WikipediaRetriever

import asyncio
import traceback
import sys
import base64
import random
import logging
    
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession

from google import genai
from google.genai import types
from PIL import Image

import json

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
research_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.2, # Low temperature for planning and extraction
    verbose=False
)

writer_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-pro",
    temperature=0.7, # Higher temperature for creative writing
    verbose=False
)

imagen_client = genai.Client()

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
    """Stats and abilities of the primary antagonist. MUST BE HIGHLY CREATIVE AND UNIQUE. Avoid boring generic tropes (like 'evil wizard' or 'bandit king') unless you give them a bizarre, memorable twist!"""
    hp: int = Field(description="Max hit points")
    ac: int = Field(description="Armor Class")
    flavor_quote: str = Field(description="A memorable, chilling, or eccentric in-character quote from the villain")
    physical_description: str = Field(description="A vivid, weird, and detailed physical description of the villain's appearance. Include height, build, distinctive features, clothing, and any unnatural traits. This needs to look incredibly cool and distinct for image generation.")
    attacks: list[str] = Field(description="List of attacks with to-hit and damage (e.g., '+7 to hit | 2d8+4 slashing'). Give the attacks creative names.")
    special_abilities: list[str] = Field(default_factory=list, description="Unique, terrifying, or bizarre villain abilities and legendary actions")
    image_base64: Optional[str] = Field(default=None, description="A Base64 string of the villain's generated portrait.")

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
    physical_description: str = Field(description="A vivid, detailed physical description of the character's appearance. CRITICAL: You MUST include their exact height, build, and relative size compared to humans, so they can be accurately placed next to each other in a group portrait. Include race features, hair, eyes, clothing, and notable markings.")

    # Combat & Abilities
    hp: int = Field(description="Max hit points calculated for their level and class")
    ac: int = Field(description="Armor Class based on their gear")

    # Image
    image_base64: Optional[str] = Field(default=None, description="A Base64 string of the character's generated portrait.")

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

class BaseCharacter(BaseModel):
    """The foundational identity of a character (before stats/gear are rolled)."""
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(description="Character name")
    race: str = Field(description="Character race")
    class_name: str = Field(alias="class", description="Character class")

class CampaignPlan(BaseModel):
    """The structured facts of the campaign before writing begins."""
    thought_process: str = Field(description="Briefly explain your reasoning for the antagonist, plot, and locations based on the user's requirements.")
    primary_antagonist: str = Field(description="Name and brief concept of the main boss/villain")
    villain_statblock: VillainStatblock = Field(description="Combat stats for the primary antagonist")
    core_conflict: str = Field(description="One sentence summarizing the main problem")
    plot_points: list[str] = Field(description="3 to 4 major events that will happen in the quest")
    factions_involved: list[str] = Field(description="1 or 2 local factions or guilds involved in the conflict")
    key_locations: list[str] = Field(description="Specific areas within the terrain the party will visit")
    suggested_party: list[BaseCharacter] = Field(description="A list of suggested heroes (name, race, class) that fit this specific campaign.")
    loot_concept: str = Field(description="The general idea for the final reward")
    cover_image_base64: Optional[str] = Field(default=None, description="Campaign cover art")
    group_image_base64: Optional[str] = Field(default=None, description="Group portrait of all heroes")
    macguffin_image_base64: Optional[str] = Field(default=None, description="Image of the final loot or artifact")

class DynamicHitlActions(BaseModel):
    """Dynamically generated branch options for the DM to choose from."""
    action_1_label: str = Field(description="Short emoji label for Option 1 (e.g. '🔥 The dragon awakes')")
    action_1_payload: str = Field(description="The actual text prompt to send back to the AI for Option 1")
    action_2_label: str = Field(description="Short emoji label for Option 2")
    action_2_payload: str = Field(description="The actual text prompt to send back to the AI for Option 2")
    action_3_label: str = Field(description="Short emoji label for Option 3")
    action_3_payload: str = Field(description="The actual text prompt to send back to the AI for Option 3")

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
    
    # State Accumulators
    party_details: Optional[PartyDetails] = None
    campaign_plan: Optional[CampaignPlan] = None
    
    # Final Outputs (Expected by app.py)
    title: Optional[str] = None
    description: Optional[str] = None
    background: Optional[str] = None
    rewards: Optional[str] = None

    # Chat (post-generation conversation)
    chat_messages: list[dict] = Field(default_factory=list, description="Chat history: [{role: 'user'|'assistant', content: str}]")
    chat_response: Optional[str] = Field(default=None, description="Latest chat response from the DM")

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
    # randomly select a spark to get unique campaigns
    sparks = [
        "ancient ruins", "political intrigue", "planar invasion", "an undead curse", 
        "a feywild connection", "a dragon cult", "abyssal corruption", "a lost magical artifact", 
        "a celestial prophecy", "a dark guild", "a forgotten clockwork city", "a heist on a moving train",
        "a cursed sentient weapon that manipulates its wielder", "a murder mystery at a masquerade ball",
        "a gladiator tournament run by devils", "an illusionary village that only exists at night",
        "a massive floating island slowly crashing to the ground", "a patron deity suddenly going silent",
        "a time loop trapping the party in a deadly dungeon", "a war between two ancient dragon siblings",
        "a mind flayer colony infiltrating the nobility", "an archfey's twisted tea party",
        "a haunted pirate galleon emerging from the mist", "a black market auction of stolen memories",
        "a kraken awakening from a centuries-long slumber", "a cult trying to summon an Eldritch horror",
        "an invasion of vampiric plants consuming a forest", "a city under siege by an army of stone golems",
        "a rogue magical experiment causing tears in reality", "a labyrinth built by a mad god to test mortals",
        "a parasitic plague spreading through the local water supply", "a masquerade where the masks give people dark powers",
        "a rebellion led by awakened animals", "a legendary forge requiring the breath of an ancient dragon to light",
        "a prison break from the most secure dungeon in the realm", "a mimic colony disguised as an entire tavern"
    ]
    spark = random.choice(sparks)
    search_query = f"D&D quest ideas for a {state.difficulty or 'Medium'} campaign in {state.terrain or 'Forest'} involving {spark}"
    
    # Try Agentic Ideation using Native Google Search
    reference_material = ""
    
    try:
        ideation_prompt = f"""You are an elite D&D Dungeon Master and an autonomous researcher.
        The user wants a campaign with the following constraints:
        - Terrain: {state.terrain}
        - Difficulty: {state.difficulty}
        - User Requirements: {state.requirements or 'None'}
        - Initial Spark: {spark}
        
        YOUR MISSION:
        Do not just write an outline off the top of your head. You MUST use your Google Search tool to deeply research ideas for this specific quest.
        1. Formulate your own search queries to find real D&D lore, monsters, and mechanics that fit the terrain and difficulty.
        2. Formulate separate queries to find interesting story tropes, puzzles, or plot twists related to the user's requirements.
        3. Gather all this inspiration, and ONLY THEN synthesize a cohesive, highly detailed D&D quest outline.
        
        Show off the unique, internet-grounded ideas you found!
        """
        ideation_response = writer_model.invoke(ideation_prompt, tools=[{"google_search": {}}])
        reference_material = f"Agentic Brainstorming & Research:\n{ideation_response.content}"
        logging.info(f"Agentic Brainstorming & Research")

    except Exception as e:
        print(f"Native Google Search failed ({e}). Falling back to DuckDuckGo and Wikipedia.")
        search_results = "No internet search results."
        wiki_results = "No Wikipedia results."
        
        with suppress(ToolException, ValueError, TypeError):
            search_results = search_internet.invoke({"query": search_query})
        with suppress(ToolException, ValueError, TypeError):
            wiki_results = search_wikipedia.invoke({"query": search_query})
            
        reference_material = f"Internet Results:\n{search_results}\n\nWikipedia Results:\n{wiki_results}"

    # Grab existing plan if it exists
    existing_plan = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan exists yet."

    prompt = f"""You are a D&D Campaign Architect. Your job is to create a logical, structured outline for a quest.
    DO NOT write the story yet. Only establish the facts.

    Constraints:
    - Terrain: {state.terrain}
    - Difficulty: {state.difficulty}
    - Party Size: {state.party_details.party_size if state.party_details else 4} players
    - User Requirements: {state.requirements or 'None'}

    ### EXISTING PLAN (Reference for Edits) ###
    {existing_plan}

    Reference Material:
    {reference_material}

    Analyze the requirements and create a strict CampaignPlan. Ensure the boss, plot points, and locations make sense together.

    CRITICAL RULES:
    1. EXPLICIT SIZING: You MUST generate EXACTLY {state.party_details.party_size if state.party_details else 4} heroes in the `suggested_party` array.
    2. EXACT CHARACTER NAMES: If the user provides specific character names in the requirements (like 'Dr. Strange', 'Shrek', etc.), you MUST use those exact names in your `suggested_party`. Do not alter them to fit the fantasy lore.
    3. EDITING MODE: If an "Existing Plan" is provided, ONLY modify the specific elements requested (e.g., changing a name). 
    4. THE COPY-PASTE MANDATE: For every field NOT requested to change, copy the content EXACTLY from the Existing Plan. Do not paraphrase or "improve" it.
    5. COLD START: If no Existing Plan is provided, create a brand new CampaignPlan from scratch.
    """
    structured_llm = research_model.with_structured_output(CampaignPlan)
    plan = structured_llm.invoke(prompt)
    
    return {"campaign_plan": plan}

async def party_creation_node(state: CampaignState):
    """Node 2: Builds the party, potentially calling MCP tools if needed."""
    party_name = state.party_details.party_name if state.party_details else "Not Provided"
    party_size = state.party_details.party_size if state.party_details else 4
    existing_characters = state.party_details.characters if state.party_details else []

    # If roster isn't locked, but the planner gave us suggestions, use those as the baseline!
    if not existing_characters and getattr(state.campaign_plan, 'suggested_party', None):
        existing_characters = [
            {"name": c.name, "race": c.race, "class": c.class_name, "level": 1}
            for c in state.campaign_plan.suggested_party
        ]
        party_size = len(existing_characters)
        # If we're seeding from suggested_party, we should also update party_name if it's still "Not Provided"
        if party_name == "Not Provided":
            party_name = "The Suggested Adventurers" # Or generate a name based on the suggested party

    plan_context = state.campaign_plan.model_dump_json(indent=2) if state.campaign_plan else "No plan available."

    mcp_tools = []
    async with mcp_server_session() as tools:
        if tools:
            mcp_tools = tools

    # Bind the MCP tools to our model outside the SSE context!
    model_with_tools = research_model.bind_tools(mcp_tools) if mcp_tools else research_model

    def build_fallback_character(index: int) -> Character:
        return Character(
            name=f"TBD Adventurer {index}",
            race="Human",
            class_name="Fighter",
            level=1,
            alignment="Neutral",
            flavor_quote="Ready for whatever the road brings.",
            physical_description="An eager adventurer of average height and sturdy build, outfitted with practical travel gear.",
            hp=10,
            ac=10,
            ability_scores={"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
            weapons=[],
            spells=[],
            skills=[],
            inventory=[],
            personality_traits=["Cautious", "Reliable"],
        )

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
    max_retries = 3
    for attempt in range(max_retries):
        try:
            if just_finished_tools:
                # Force Pydantic output!
                structured_llm = research_model.with_structured_output(PartyDetails)
                final_party = await structured_llm.ainvoke(messages)
                
                # Standard cleanup
                if party_name != "Not Provided":
                    final_party.party_name = party_name
                    
                final_party.party_size = party_size
                final_party.characters = final_party.characters[:party_size]

                while len(final_party.characters) < party_size:
                    final_party.characters.append(build_fallback_character(len(final_party.characters) + 1))
                
                return {
                    "messages": [AIMessage(content="Generated final PartyDetails JSON.")],
                    "party_details": final_party.model_dump(by_alias=True)
                }
            else:
                # Let it decide whether to use tools or write text
                response = await model_with_tools.ainvoke(messages)
                
                if not getattr(response, 'tool_calls', None):
                    print("DEBUG: Model declined to use tools. Forcing structured output...", file=sys.stderr)
                    structured_llm = research_model.with_structured_output(PartyDetails)
                    final_party = await structured_llm.ainvoke(messages)
                    
                    if party_name != "Not Provided":
                        final_party.party_name = party_name
                        
                    final_party.party_size = party_size
                    final_party.characters = final_party.characters[:party_size]

                    while len(final_party.characters) < party_size:
                        final_party.characters.append(build_fallback_character(len(final_party.characters) + 1))
                    
                    return {
                        "messages": [AIMessage(content="Generated final PartyDetails JSON (no tools).")],
                        "party_details": final_party.model_dump(by_alias=True)
                    }
                
                # Sanitize response to prevent pickling un-awaited Http/Google SDK coroutines inside response_metadata
                clean_response = AIMessage(
                    content=str(response.content) if response.content else "",
                    tool_calls=getattr(response, 'tool_calls', []),
                    id=response.id
                )
                return {"messages": [clean_response]}
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"Model Invocation Error on attempt {attempt + 1}: {e}. Retrying in 3 seconds...", file=sys.stderr)
                await asyncio.sleep(3)
            else:
                print(f"Model Invocation Error after {max_retries} attempts: {e}", file=sys.stderr)
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
        
    if result is not None and "messages" in result:
        sanitized = []
        for msg in result["messages"]:
            if isinstance(msg, ToolMessage):
                sanitized.append(ToolMessage(
                    content=str(msg.content),
                    name=msg.name,
                    tool_call_id=msg.tool_call_id,
                    status=msg.status
                ))
            else:
                sanitized.append(msg)
        return {"messages": sanitized}
    return {"messages": []}

async def generate_image_base64(prompt: str) -> Optional[str]:
    """Helper function to call Gemini 2.5 Flash Image and return a base64 string."""
    try:
        config = types.GenerateContentConfig(
            response_modalities = ['TEXT', 'IMAGE'],
            image_config = types.ImageConfig(
                aspect_ratio = "16:9",
                image_size = "4K",
            ),
        )
        result = await imagen_client.aio.models.generate_content(
            model = 'gemini-2.5-flash-image',
            contents = prompt,
            config = config,
        )
        for part in result.parts:
            if part.inline_data is not None:
                print("✨ Successfully conjured an image. Resting a moment to regain spell slots... (API cooldown)")
                await asyncio.sleep(4)
                return base64.b64encode(part.inline_data.data).decode('utf-8')
    except Exception as e:
        print(f"A wild magic surge disrupted the image generation: {e}")

async def generate_image_base64_multimodal(prompt: str, images_b64: list[str]) -> Optional[str]:
    """Helper function to call Gemini 1.5 Pro (which supports multimodal inference) to redraw/combine images."""
    try:
        contents = [prompt]
        for b64 in images_b64:
            if b64 and b64 != "[GENERATED IMAGE STORED]":
                img_data = base64.b64decode(b64)
                contents.append(
                    types.Part.from_bytes(
                        data=img_data,
                        mime_type="image/jpeg"
                    )
                )
                
        config = types.GenerateContentConfig(
            response_modalities = ['TEXT', 'IMAGE'],
            temperature = 1,
            image_config = types.ImageConfig(
                aspect_ratio = "16:9",
            ),
        )

        result = await imagen_client.aio.models.generate_content(
            model='gemini-2.5-flash-image',
            contents=contents,
            config=config,
        )
        
        for part in result.parts:
            if part.inline_data is not None:
                print("✨ Successfully conjured a magical image. Resting a moment to regain spell slots... (API cooldown)")
                await asyncio.sleep(4)
                return base64.b64encode(part.inline_data.data).decode('utf-8')

    except Exception as e:
        print(f"A wild magic surge disrupted the magical image generation: {e}")
        await asyncio.sleep(4)

    return None

async def character_portrait_node(state: CampaignState):
    """Node 4: Generates portraits for each character using Google Imagen."""
    if not state.party_details or not state.party_details.characters:
        return {}

    # Generate villain portrait first if present
    if state.campaign_plan and state.campaign_plan.villain_statblock:
        villain = state.campaign_plan.villain_statblock
        villain_prompt = f"""A breathtaking, masterpiece digital painting of a sinister D&D villain, official Dungeons and Dragons 5e sourcebook art style, trending on ArtStation. 
        Subject: {villain.physical_description}
        Details: Render them in an intimidating, dramatic pose that exudes power and menace. imposing silhouette.
        Aesthetic: High-fidelity dark fantasy concept art, Unreal Engine 5 render, chilling atmosphere, hyperdetailed villain design, gothic fantasy, eerie glowing accents, cinematic lighting, dramatic shadows, 8k resolution, photorealistic textures, vivid moody colors, painted by Greg Rutkowski and Magali Villeneuve. 
        Background: A deeply atmospheric, dark, and cinematic background depicting a corrupted {state.terrain if state.terrain else 'fantasy world'}.
        Critical Rule: NO TEXT, NO WATERMARKS, NO UI ELEMENTS, NO BORDERS.
        """
        b64 = await generate_image_base64(villain_prompt)
        if b64:
            villain.image_base64 = b64

    # We generate individual portraits
    for char in state.party_details.characters:
        weapons_str = ", ".join(w.name for w in char.weapons) if char.weapons else "none"
        inventory_str = ", ".join(char.inventory) if char.inventory else "none"

        full_prompt = f"""A breathtaking, masterpiece digital painting of a D&D character, official Dungeons and Dragons 5e sourcebook art style. 
        Subject: A {char.race} {char.class_name}. {char.physical_description if char.physical_description else 'A brave adventurer.'}
        Details: They are wielding {weapons_str} and carrying {inventory_str}. Ensure their gear matches their class.
        Aesthetic: High-fidelity fantasy concept art, Unreal Engine 5 render, incredibly detailed, heroic pose, cinematic lighting, 8k resolution, photorealistic textures, painted by Greg Rutkowski and Magali Villeneuve. 
        Background: A beautiful, atmospheric background depicting a {state.terrain if state.terrain else 'fantasy world'}.
        Critical Rule: NO TEXT, NO WATERMARKS, NO UI ELEMENTS, NO BORDERS."""
        
        b64 = await generate_image_base64(full_prompt)
        if b64:
            char.image_base64 = b64
            
    # --- Generate Cover Image ---
    if state.campaign_plan and state.campaign_plan.key_locations:
        cover_prompt = f"""A breathtaking, masterpiece digital landscape painting of {state.campaign_plan.key_locations[0]}. Terrain: {state.terrain if state.terrain else 'fantasy world'}. 
        Aesthetic: High-fidelity fantasy concept art, Unreal Engine 5 render, global illumination, ray tracing, incredibly detailed, best quality, cinematic volumetric lighting, 8k resolution, photorealistic textures, vivid colors, painted by Greg Rutkowski and Magali Villeneuve. 
        Critical Rule: NO TEXT, NO WATERMARKS, NO UI ELEMENTS, NO BORDERS."""
        b64 = await generate_image_base64(cover_prompt)
        if b64:
            state.campaign_plan.cover_image_base64 = b64
            
    # --- Generate Group Image logically referencing the Hero Portraits ---
    if state.party_details and state.party_details.characters:
        heroes_b64 = [c.image_base64 for c in state.party_details.characters if c.image_base64]
        if heroes_b64:
            heroes_desc = "\n".join([f"- {c.name} ({c.race} {c.class_name}): {c.physical_description}" for c in state.party_details.characters])
            group_prompt = f"""A breathtaking, masterpiece digital painting of a diverse adventuring party standing together heroically. 
            The party consists of EXACTLY {len(state.party_details.characters)} characters:
            {heroes_desc}
            Details: Render all {len(state.party_details.characters)} characters standing next to each other, accurately reflecting their different heights, sizes, and builds in a cinematic group shot. They are in a {state.terrain if state.terrain else 'fantasy world'} environment. DO NOT render them as a grid; composite them into a single, cohesive cinematic shot looking at the camera. Use the provided individual portraits as direct visual reference for their faces, armor, and aesthetic.
            Aesthetic: High-fidelity fantasy concept art, Unreal Engine 5 render, global illumination, ray tracing, incredibly detailed, best quality, cinematic volumetric lighting, 8k resolution, photorealistic textures, vivid colors. 
            Critical Rule: NO TEXT, NO WATERMARKS, NO BORDERS. YOU MUST INCLUDE EXACTLY {len(state.party_details.characters)} DISTINCT PEOPLE."""
            
            b64 = await generate_image_base64_multimodal(group_prompt, heroes_b64)
            if b64:
                if state.campaign_plan:
                    state.campaign_plan.group_image_base64 = b64
            else:
                # Fallback to the original math logic if the API rejects the multimodal format
                print("Multimodal stitching failed. Falling back to simple prompt generation without reference images.")
                b64 = await generate_image_base64(group_prompt)
                if b64:
                    if state.campaign_plan:
                        state.campaign_plan.group_image_base64 = b64

    # --- Generate Macguffin Image ---
    if state.campaign_plan and state.campaign_plan.loot_concept:
        macguffin_prompt = f"""A breathtaking, masterpiece digital painting of a legendary D&D artifact or treasure: {state.campaign_plan.loot_concept}. 
        Aesthetic: High-fidelity fantasy concept art, Unreal Engine 5 render, glowing magical aura, intricate details, best quality, dramatic shadows, cinematic lighting, 8k resolution, photorealistic textures. 
        Critical Rule: NO TEXT, NO WATERMARKS, NO UI ELEMENTS, NO BORDERS."""
        b64 = await generate_image_base64(macguffin_prompt)
        if b64:
            state.campaign_plan.macguffin_image_base64 = b64

    return {
        "party_details": state.party_details,
        "campaign_plan": state.campaign_plan
    }

async def narrative_writer_node(state: CampaignState):
    """Node 3: Takes the structured facts and writes the final, high-quality Markdown prose."""

    # Clear tools messages from previos node
    state.messages.clear()

    if state.campaign_plan:
        plan_dict = state.campaign_plan.model_dump(by_alias=True)
        if plan_dict.get('villain_statblock') and 'image_base64' in plan_dict['villain_statblock']:
            plan_dict['villain_statblock']['image_base64'] = "[GENERATED IMAGE STORED]"
        if plan_dict.get('cover_image_base64'):
            plan_dict['cover_image_base64'] = "[GENERATED IMAGE STORED]"
        if plan_dict.get('group_image_base64'):
            plan_dict['group_image_base64'] = "[GENERATED IMAGE STORED]"
        if plan_dict.get('macguffin_image_base64'):
            plan_dict['macguffin_image_base64'] = "[GENERATED IMAGE STORED]"
        plan_context = json.dumps(plan_dict, indent=2)
    else:
        plan_context = "No plan available."
    
    party_context = "No party details."
    if state.party_details:
        party_dict = state.party_details.model_dump(by_alias=True)
        # Strip out the massive base64 image strings before sending to LLM to prevent Token Limit 400 errors
        for char in party_dict.get('characters', []):
            if 'image_base64' in char:
                char['image_base64'] = "[GENERATED IMAGE STORED]"
        party_context = json.dumps(party_dict, indent=2)

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
    content = await structured_writer.ainvoke(prompt)
    
    return {
        "title": content.title,
        "description": content.description,
        "background": content.background,
        "rewards": content.rewards
    }

async def determine_next_steps(state: CampaignState, current_node: str):
    """Determine the next steps in the campaign generation process."""

    if current_node == "PlannerNode":
        return "PartyCreationNode"
    elif current_node == "PartyCreationNode":
        if not state.title: # If no narrative has been written yet, go to character portraits
            return "CharacterPortraitNode"
    
        prompt = f"""Did the user request a change to the story, narrative, or TITLE, or just character stats?

        User Request: {state.requirements}
        
        Respond with exactly ONE WORD:
        - "YES" if they explicitly asked for story/plot/narrative/title changes
        - "NO" if they only want character changes
        """

        response = await research_model.ainvoke(prompt)
        wants_story = "YES" in response.content.upper()
        return "CharacterPortraitNode" if wants_story else END # If story changes, go to portraits, otherwise end.

    elif current_node == "CharacterPortraitNode":
        # After portraits, if a narrative exists, we might need to rewrite it.
        # If state.title exists, it means a narrative was previously generated.
        # If state.title does not exist, it means this is the first run, so we proceed to narrative.
        if state.title:
            # If a narrative exists, check if user requested changes that would require rewriting.
            prompt = f"""Did the user request a change to the story, narrative, or TITLE?

            User Request: {state.requirements}
            
            Respond with exactly ONE WORD:
            - "YES" if they explicitly asked for story/plot/narrative/title changes
            - "NO" if they only want character changes (which are already handled by portraits)
            """
            response = await research_model.ainvoke(prompt)
            wants_story = "YES" in response.content.upper()
            return "NarrativeWriterNode" if wants_story else END
        else:
            return "NarrativeWriterNode" # First run, always go to narrative after portraits

    elif current_node == "NarrativeWriterNode":
        return END

    return END

# --- Graph Construction ---
campaign_graph = StateGraph(CampaignState)

# --- Chat Node (post-generation conversation) ---
async def chat_node(state: CampaignState):
    """Handles follow-up chat after campaign generation is complete.
    Uses the full campaign context to respond as a knowledgeable DM."""
    
    # Build campaign context summary
    context_parts = []
    if state.campaign_plan:
        plan = state.campaign_plan
        context_parts.append(f"Campaign: {state.title or 'Untitled'}")
        context_parts.append(f"Core Conflict: {plan.core_conflict}")
        context_parts.append(f"Primary Antagonist: {plan.primary_antagonist}")
        if plan.villain_statblock:
            v = plan.villain_statblock
            context_parts.append(f"Villain Details: {plan.primary_antagonist} - HP:{v.hp}, AC:{v.ac}")
            if v.physical_description:
                context_parts.append(f"Villain Appearance: {v.physical_description}")
        if plan.plot_points:
            context_parts.append(f"Plot Points: {'; '.join(plan.plot_points)}")
        if plan.factions_involved:
            context_parts.append(f"Factions: {'; '.join(plan.factions_involved)}")
        if plan.key_locations:
            context_parts.append(f"Key Locations: {'; '.join(plan.key_locations)}")
        context_parts.append(f"Loot: {plan.loot_concept}")
    
    if state.party_details:
        party = state.party_details
        context_parts.append(f"Party: {party.party_name} ({party.party_size} members)")
        for c in party.characters:
            char_info = f"  - {c.name} ({c.race} {c.class_name}, Level {c.level})"
            if c.backstory_hook:
                char_info += f" — {c.backstory_hook}"
            context_parts.append(char_info)
    
    if state.background:
        context_parts.append(f"Background Lore: {state.background}")
    if state.description:
        context_parts.append(f"Description: {state.description}")
    if state.rewards:
        context_parts.append(f"Rewards: {state.rewards}")
    
    context_parts.append(f"Setting: {state.terrain or 'Fantasy world'}, Difficulty: {state.difficulty or 'Medium'}")
    
    campaign_context = "\n".join(context_parts)
    
    # Build the chat history for context
    chat_history = ""
    if state.chat_messages:
        for msg in state.chat_messages:
            role = "DM" if msg.get("role") == "assistant" else "Player"
            chat_history += f"\n{role}: {msg.get('content', '')}"
    
    system_prompt = f"""You are an expert Dungeon Master who has just created an incredible D&D campaign. 
You have deep knowledge of every detail of this campaign and can answer any question about it.
You speak in a warm, knowledgeable, and slightly dramatic tone — like a seasoned DM at the table.
Keep responses concise but flavorful (2-4 paragraphs max unless asked for detail).
You can elaborate on lore, suggest encounter modifications, provide tactical advice, 
expand on NPC motivations, create additional side quests, or help with any campaign-related questions.

--- CAMPAIGN CONTEXT ---
{campaign_context}
--- END CONTEXT ---
"""
    
    # Get the latest user message (last item in chat_messages)
    user_message = ""
    if state.chat_messages:
        user_message = state.chat_messages[-1].get("content", "")
    
    messages_for_llm = [
        SystemMessage(content=system_prompt),
    ]
    
    # Add previous chat as conversation history
    if len(state.chat_messages) > 1:
        for msg in state.chat_messages[:-1]:
            if msg.get("role") == "user":
                messages_for_llm.append(HumanMessage(content=msg["content"]))
            else:
                messages_for_llm.append(AIMessage(content=msg["content"]))
    
    # Add current user message
    messages_for_llm.append(HumanMessage(content=user_message))
    
    response = await writer_model.ainvoke(messages_for_llm)
    
    return {
        "chat_response": response.content
    }

campaign_graph.add_node("PlannerNode", planner_node)
campaign_graph.add_node("PartyCreationNode", party_creation_node)
campaign_graph.add_node("CharacterPortraitNode", character_portrait_node)
campaign_graph.add_node("NarrativeWriterNode", narrative_writer_node)
campaign_graph.add_node("MCPToolNode", mcp_tool_node)
campaign_graph.add_node("ChatNode", chat_node)

# Always start at the PlannerNode. If we are editing, PlannerNode handles the edit.
campaign_graph.add_edge(START, "PlannerNode")

# Async Route Wrappers for LangGraph
async def route_planner(state: CampaignState):
    return await determine_next_steps(state, "PlannerNode")

async def route_party(state: CampaignState):
    return await determine_next_steps(state, "PartyCreationNode")

async def route_portraits(state: CampaignState):
    return await determine_next_steps(state, "CharacterPortraitNode")

# Step 2: Dynamic Routing
campaign_graph.add_conditional_edges(
    "PlannerNode",
    route_planner,
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

# Step 3: Dynamic Routing for PartyCreationNode
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
campaign_graph.add_conditional_edges(
    "route_next", 
    route_party,
     {
        "CharacterPortraitNode": "CharacterPortraitNode", 
        "NarrativeWriterNode": "NarrativeWriterNode", 
        END: END
     })

campaign_graph.add_conditional_edges(
    "CharacterPortraitNode", 
    route_portraits, 
    {
        "NarrativeWriterNode": "NarrativeWriterNode", 
        END: END
    })

campaign_graph.add_edge("MCPToolNode", "PartyCreationNode")
campaign_graph.add_edge("NarrativeWriterNode", END)
campaign_graph.add_edge("ChatNode", END)

memory = MemorySaver()
app = campaign_graph.compile(checkpointer=memory, interrupt_after=["PlannerNode"])

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