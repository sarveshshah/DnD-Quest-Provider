
from typing import Literal, Optional
import chainlit as cl
import re
import json

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import create_agent

from dnd import app as campaign_generator, CampaignState, PartyDetails

from dotenv import load_dotenv
load_dotenv()

# define model
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.7
)

# Tool to generate D&D campaigns
@tool
def generate_campaign(
    party_name: str,
    party_size: int,
    terrain: Literal["Arctic", "Coast", "Desert", "Forest", "Grassland", "Mountain", "Swamp", "Underdark"],
    difficulty: Literal["easy", "medium", "hard", "deadly"],
    requirements: Optional[str] = None,
    existing_characters: Optional[list[dict[str, str | int | list[str] | None]]] = None,
    roster_locked: bool = True
) -> str:
    """
    Generate a complete Dungeons & Dragons campaign with party and quest details.
    
    Args:
        party_name: Name of the adventuring party
        party_size: Number of players/people/members in the party (1-10)
        terrain: The terrain type for the campaign
        difficulty: Campaign difficulty level
    
    Returns:
        A complete campaign with party details, title, description, background, and rewards
    """
    try:
        # Create initial state with campaign requirements
        initial_state = CampaignState(
            terrain=terrain,
            difficulty=difficulty,
            party_details=PartyDetails(
                party_name=party_name,
                party_size=party_size,
                characters=existing_characters or []
            ),
            requirements=requirements,
            roster_locked=roster_locked
        )
        
        # Run the campaign generator
        result = campaign_generator.invoke(initial_state)
        
        # Extract values safely from the result dictionary
        title = str(result.get('title', 'Epic Adventure'))
        description = str(result.get('description', 'An exciting adventure awaits!'))
        background = str(result.get('background', 'The story begins...'))
        rewards = str(result.get('rewards', 'Glory and treasure!'))
        
        # Extract party details
        party_data = result.get('party_details', {})
        if isinstance(party_data, dict):
            actual_party_name = str(party_data.get('party_name', party_name))
            actual_party_size = int(party_data.get('party_size', party_size))
            characters = party_data.get('characters', [])
        else:
            actual_party_name = party_name
            actual_party_size = party_size
            characters = []
        
        # Format the output with markdown for richer rendering in Chainlit
        lines = [
            f"## 🎲 Campaign: {title}",
            "",
            "### 📖 Description",
            description,
            "",
            "### 🌄 Background",
            background,
            "",
            "### 🗺️ Setting",
            f"- Terrain: {terrain}",
            f"- Difficulty: {difficulty}",
            "",
            "### 🏆 Rewards",
            rewards,
            "",
            f"### ⚔️ Party: {actual_party_name}",
            f"- Size: {actual_party_size} adventurers",
        ]
        
        # Add character details if available
        if characters and len(characters) > 0:
            lines.append("")
            lines.append("### 👥 Party Members")
            lines.append("")
            
            for i, char in enumerate(characters, 1):
                if isinstance(char, dict):
                    name = str(char.get('name', f'Hero {i}'))
                    race = str(char.get('race', 'Unknown'))
                    char_class = str(char.get('class', 'Adventurer'))
                    level = str(char.get('level', '1'))
                    backstory = str(char.get('backstory_hook', ''))
                    personality_traits = char.get('personality_traits')
                    ideals = char.get('ideals')
                    bonds = char.get('bonds')
                    flaws = char.get('flaws')
                    inventory = char.get('inventory')
                    weapons = char.get('weapons')
                    skills = char.get('skills')
                    
                    lines.append(f"{i}. **{name}**")
                    lines.append(f"   - Race: {race}")
                    lines.append(f"   - Class: {char_class}")
                    lines.append(f"   - Level: {level}")
                    if backstory and backstory != 'None':
                        lines.append(f"   - Backstory: {backstory}")
                    if personality_traits:
                        lines.append(f"   - Traits: {', '.join(personality_traits)}")
                    if ideals:
                        lines.append(f"   - Ideals: {ideals}")
                    if bonds:
                        lines.append(f"   - Bonds: {bonds}")
                    if flaws:
                        lines.append(f"   - Flaws: {flaws}")
                    if inventory:
                        lines.append(f"   - Inventory: {inventory}")
                    if weapons:
                        lines.append(f"   - Weapons: {weapons}")
                    if skills:
                        lines.append(f"   - Skills: {skills}")
                    lines.append("")
        
        formatted = "\n".join(lines)
        characters_json = json.dumps(characters, ensure_ascii=True)
        return f"{formatted}\n\n[[_CHARACTERS_JSON_]]{characters_json}[[/CHARACTERS_JSON]]"
        
    except (ValueError, TypeError) as exc:
        return f"Error generating campaign: {str(exc)}\n\nPlease try again with valid parameters."

# Create ReAct agent
tools = [generate_campaign]
agent = create_agent(model, tools)

@cl.on_message
async def on_message(message: cl.Message):
    # Check for reset command
    if message.content.lower().strip() in ['reset', 'start over', 'restart']:
        cl.user_session.set("campaign_params", {
            "party_name": None,
            "party_size": None,
            "terrain": None,
            "difficulty": None,
            "requirements": None,
            "characters": [],
            "roster_locked": True
        })
        cl.user_session.set("messages", None)
        await cl.Message(content="✨ Campaign parameters reset! Let's start fresh. What kind of campaign would you like to create?").send()
        return
    
    # Get or initialize campaign parameters in session
    campaign_params = cl.user_session.get("campaign_params")
    if campaign_params is None:
        campaign_params = {
            "party_name": None,
            "party_size": None,
            "terrain": None,
            "difficulty": None,
            "requirements": None,
            "characters": [],
            "roster_locked": True
        }
        cl.user_session.set("campaign_params", campaign_params)
    
    # Build dynamic system prompt showing what we already know
    known_params = []
    missing_params = []
    
    if campaign_params["party_size"]:
        known_params.append(f"- Party Size: {campaign_params['party_size']} players ✓")
    else:
        missing_params.append("party_size")
    
    if campaign_params["party_name"]:
        known_params.append(f"- Party Name: {campaign_params['party_name']} ✓")
    else:
        missing_params.append("party_name")
    
    if campaign_params["terrain"]:
        known_params.append(f"- Terrain: {campaign_params['terrain']} ✓")
    else:
        missing_params.append("terrain")
    
    if campaign_params["difficulty"]:
        known_params.append(f"- Difficulty: {campaign_params['difficulty']} ✓")
    else:
        missing_params.append("difficulty")

    if campaign_params["requirements"]:
        known_params.append("- Requirements: Provided ✓")
    if campaign_params["characters"]:
        known_params.append(f"- Characters: {len(campaign_params['characters'])} stored ✓")
    if campaign_params.get("roster_locked") and campaign_params["characters"]:
        known_params.append("- Roster Locked: Yes ✓")
    
    known_info = "\n".join(known_params) if known_params else "None yet"
    
    system_prompt = f"""You are a PARAMETER COLLECTOR for a D&D Campaign Generator.

    CURRENT COLLECTED PARAMETERS:
    {known_info}
    
    YOUR ONLY JOB: Extract campaign parameters from user messages and call generate_campaign tool when ready.
    
    PARAMETER EXTRACTION RULES:
    1. party_size: ANY number with people/players/members/characters ("7 people" = 7, "for 5" = 5)
       - If user lists character names, COUNT them (e.g., "Night King, Jon Snow, Cersei" = 3 minimum)
    
    2. party_name: Any group name or theme mentioned ("Game of Thrones", "The Avengers", etc.)
       - If theme mentioned but no specific name, use the theme as the name
    
    3. terrain: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, Underdark
       - Default to Forest if theme fits or not specified
    
    4. difficulty: easy, medium, hard, deadly
       - Default to medium if not specified

    5. requirements: The full user request text describing constraints, characters, and villain details.
         - Preserve exact wording when possible; do not paraphrase.
         - If requirements already exist, append new constraints only when the user adds/changes them.
    6. characters: If characters are already stored, preserve them and add only new ones when requested.
    7. roster_locked: If true, existing characters must remain unchanged.
    
    CRITICAL RULES:
    - DO NOT generate campaign content yourself (no quests, characters, stories)
    - DO NOT ask for parameters that have ✓ - they are already collected
    - PRESERVE all existing parameters marked with ✓
    - When you have all required parameters (party_name, party_size, terrain, difficulty, requirements), IMMEDIATELY call generate_campaign tool
    - Always pass existing_characters if any are stored
    - Always pass roster_locked flag
    - If missing parameters, ask for ONLY the missing ones briefly
    - Use defaults for terrain/difficulty if user wants to proceed
    
    EXAMPLES:
    User: "Create a GoT campaign for 7 people"
    → Extract: party_size=7, party_name="Game of Thrones Campaign", use defaults
    → Call generate_campaign immediately
    
    User: "7 people named The Warriors"
    → Extract: party_size=7, party_name="The Warriors"
    → Call generate_campaign with defaults
    """
    
    # Get or create message history
    messages = cl.user_session.get("messages")
    if messages is None:
        messages = [SystemMessage(content=system_prompt)]
        cl.user_session.set("messages", messages)
    else:
        # Update system message with current state
        messages[0] = SystemMessage(content=system_prompt)
    
    messages.append(HumanMessage(content=message.content))
    
    # Pre-process: if user is clearly requesting a campaign and we can infer params, help the agent
    user_text_lower = message.content.lower()
    is_campaign_request = any(word in user_text_lower for word in ['create', 'generate', 'make', 'campaign', 'quest'])
    
    if is_campaign_request:
        if not campaign_params["requirements"]:
            campaign_params["requirements"] = message.content.strip()
        else:
            if any(word in user_text_lower for word in ["add", "also", "include", "change", "replace", "swap"]):
                campaign_params["requirements"] = (
                    f"{campaign_params['requirements']}\n\nAdditional requirements: {message.content.strip()}"
                )
        unlock_keywords = ["change", "replace", "remove", "edit", "redo", "regenerate", "revise", "swap"]
        if any(word in user_text_lower for word in unlock_keywords):
            campaign_params["roster_locked"] = False
        elif campaign_params["characters"]:
            campaign_params["roster_locked"] = True
        # Try to extract party_size if not already set
        if not campaign_params["party_size"]:
            # Look for numbers with people/players/members
            size_match = re.search(r'(\d+)\s*(?:people|players?|members?|characters?)', user_text_lower)
            if size_match:
                campaign_params["party_size"] = int(size_match.group(1))
        
        # If party_name not set and there's a theme, use it
        if not campaign_params["party_name"]:
            if 'game of thrones' in user_text_lower or 'got' in user_text_lower or 'westeros' in user_text_lower:
                campaign_params["party_name"] = "Game of Thrones Campaign"
            elif 'lord of the rings' in user_text_lower or 'lotr' in user_text_lower:
                campaign_params["party_name"] = "Middle Earth Campaign"
        
        # Apply defaults if campaign is requested and we have at least name + size
        if campaign_params["party_size"] and campaign_params["party_name"]:
            if not campaign_params["terrain"]:
                campaign_params["terrain"] = "Forest"
            if not campaign_params["difficulty"]:
                campaign_params["difficulty"] = "Medium"
            
            cl.user_session.set("campaign_params", campaign_params)
            
            # If we now have all 4, the agent should call the tool immediately
            # Update the system prompt to reflect this
            known_params = []
            for key, val in campaign_params.items():
                if val:
                    known_params.append(f"- {key.replace('_', ' ').title()}: {val} ✓")
            known_info = "\n".join(known_params)
            
            # Force the agent to see we have everything
            messages[0] = SystemMessage(content=f"""You are a PARAMETER COLLECTOR for a D&D Campaign Generator.

CURRENT COLLECTED PARAMETERS:
{known_info}

ALL PARAMETERS ARE NOW READY! Immediately call the generate_campaign tool with these exact parameters:
- party_name: "{campaign_params['party_name']}"
- party_size: {campaign_params['party_size']}
- terrain: "{campaign_params['terrain']}"
- difficulty: "{campaign_params['difficulty']}"
- requirements: {campaign_params['requirements'] or ''}
- existing_characters: {json.dumps(campaign_params['characters'], ensure_ascii=True)}
- roster_locked: {str(campaign_params.get('roster_locked', True)).lower()}

DO NOT ask for more information. DO NOT generate content yourself. JUST CALL THE TOOL NOW.
""")
    
    # Invoke the agent
    response = await agent.ainvoke({"messages": messages})
    
    # Check if generate_campaign was called and extract parameters from tool call
    tool_was_called = False
    for msg in response["messages"]:
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            for tool_call in msg.tool_calls:
                if tool_call["name"] == "generate_campaign":
                    tool_was_called = True
                    # Update our stored parameters with what was used
                    args = tool_call["args"]
                    campaign_params["party_name"] = args.get("party_name")
                    campaign_params["party_size"] = args.get("party_size")
                    campaign_params["terrain"] = args.get("terrain")
                    campaign_params["difficulty"] = args.get("difficulty")
                    campaign_params["requirements"] = args.get("requirements")
                    if args.get("existing_characters"):
                        campaign_params["characters"] = args.get("existing_characters")
                    if "roster_locked" in args:
                        campaign_params["roster_locked"] = bool(args.get("roster_locked"))
                    cl.user_session.set("campaign_params", campaign_params)
    
    # Update message history
    cl.user_session.set("messages", response["messages"])
    
    # If tool was called, just show the campaign output from the tool, skip AI commentary
    if tool_was_called:
        # Find the tool message (contains the campaign output)
        for msg in reversed(response["messages"]):
            if hasattr(msg, 'type') and msg.type == 'tool':
                campaign_text = str(msg.content)
                if "[[_CHARACTERS_JSON_]]" in campaign_text:
                    rendered, _, tail = campaign_text.partition("[[_CHARACTERS_JSON_]]")
                    payload, _, _ = tail.partition("[[/CHARACTERS_JSON]]")
                    if payload.strip():
                        try:
                            campaign_params["characters"] = json.loads(payload)
                            campaign_params["roster_locked"] = True
                            cl.user_session.set("campaign_params", campaign_params)
                        except json.JSONDecodeError:
                            pass
                    campaign_text = rendered.strip()
                await cl.Message(content=campaign_text).send()
                return
    
    # Otherwise, extract the AI's conversational response
    final_text = ""
    for msg in reversed(response["messages"]):
        # Skip tool messages
        if hasattr(msg, 'type') and msg.type == 'tool':
            continue
        # Get AI message content
        if hasattr(msg, 'content') and msg.content:
            content = msg.content
            if isinstance(content, str):
                final_text = content
                break
            elif isinstance(content, list):
                # Extract text from content blocks
                texts = []
                for block in content:
                    if isinstance(block, dict) and 'text' in block:
                        texts.append(block['text'])
                if texts:
                    final_text = '\n'.join(texts)
                    break
    
    if final_text:
        await cl.Message(content=final_text).send()
    else:
        await cl.Message(content="Ready to generate your campaign! Just need a bit more info.").send()

@cl.on_chat_start
async def on_chat_start():
    """Welcome message when chat starts"""
    # Initialize campaign parameters
    cl.user_session.set("campaign_params", {
        "party_name": None,
        "party_size": None,
        "terrain": None,
        "difficulty": None,
        "requirements": None,
        "characters": [],
        "roster_locked": True
    })
    
    welcome_msg = """# 🎲 Welcome to D&D Campaign Generator! ⚔️

I'm your Dungeon Master assistant, ready to help you create an epic Dungeons & Dragons campaign!

I'll help you build your campaign step-by-step. Just tell me what you have in mind, and I'll remember all the details as we go!

**What I need:**
- 🏰 **Party Name**: What's your adventuring group called?
- 👥 **Party Size**: How many players/people/members?
- 🗺️ **Terrain**: Arctic, Coast, Desert, Forest, Grassland, Mountain, Swamp, or Underdark
- ⚔️ **Difficulty**: easy, medium, hard, or deadly

**You can provide details all at once or gradually across multiple messages - I'll remember everything!**

Examples:
- "Create a campaign for 7 people"
- "Call them The Westeros Warriors"  
- "Make it in a Mountain terrain with hard difficulty"

Type 'reset' anytime to start over!
"""
    await cl.Message(content=welcome_msg).send()
