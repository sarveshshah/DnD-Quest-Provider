import chainlit as cl
import json
from typing import Literal, Optional
from pydantic import BaseModel, Field

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage

from chainlit.input_widget import TextInput, Select, Slider

from dnd import app as campaign_generator, CampaignState, PartyDetails

from dotenv import load_dotenv
load_dotenv()

# --- Models ---
extractor_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash", 
    temperature=0.1,
    verbose=True
)

chat_model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
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

async def generate_campaign(state: dict):
    if not state["party_name"]: state["party_name"] = "The Nameless Heroes"
    if not state["party_size"]: state["party_size"] = 4
    if not state["terrain"]: state["terrain"] = "Forest"
    if not state["difficulty"]: state["difficulty"] = "Medium"
    
    # msg = cl.Message(content="🎲 *Rolling the dice... orchestrating your campaign across the multiverse!*")
    # await msg.send()
    
    initial_graph_state = CampaignState(
        terrain=state["terrain"], 
        difficulty=state["difficulty"],
        requirements=state["requirements"], 
        roster_locked=state["roster_locked"],
        party_details=PartyDetails(
            party_name=state["party_name"], 
            party_size=state["party_size"],
            characters=state["characters"]
        )
    )
    
    try:
        final_state = initial_graph_state.model_dump(by_alias=True)
        
        # 1. Start with an initial "table setting" message
        async with cl.Step(name="🎲 Preparing the table...") as parent_step:
            
            async for output in campaign_generator.astream(initial_graph_state):
                
                for node_name, node_state in output.items():
                    
                    if node_name == "PlannerNode":
                        parent_step.name = "🗺️ Gathering the miniatures and mapping the realm..."
                        await parent_step.update()
                        
                        # Start with present tense
                        async with cl.Step(name="Brainstorming the plot...", parent_id=parent_step.id) as step:
                            plan = node_state.get('campaign_plan')
                            if plan:
                                plot_bullets = "\n".join([f"- {p}" for p in plan.plot_points])
                                locations_bullets = "\n".join([f"- {l}" for l in plan.key_locations])
                                
                                clean_markdown = f"### 🧠 DM's Notes\n_{plan.thought_process}_\n\n**Villain:** {plan.primary_antagonist}\n**Conflict:** {plan.core_conflict}\n\n**Key Locations:**\n{locations_bullets}\n\n**Plot Outline:**\n{plot_bullets}\n\n**Loot:** {plan.loot_concept}"
                                step.output = clean_markdown
                            else:
                                step.output = "Thinking..."
                            
                            # CHANGE TO PAST TENSE BEFORE EXITING
                            step.name = "🗺️ Campaign World Planned"
                            await step.update()
                            
                    elif node_name == "PartyCreationNode":
                        parent_step.name = "⚔️ Rolling initiative and crafting character sheets..."
                        await parent_step.update()
                        
                        # Start with present tense
                        async with cl.Step(name="Drafting the roster...", parent_id=parent_step.id) as step:
                            party = node_state.get('party_details')
                            if party:
                                party_name = party.get('party_name', 'The Nameless')
                                chars = party.get('characters', [])
                                char_bullets = "\n".join([f"- **{c.get('name')}**: Level {c.get('level')} {c.get('race')} {c.get('class')}" for c in chars])
                                step.output = f"### 📝 Roster: {party_name}\n\n{char_bullets}"
                            else:
                                step.output = "Rolling characters..."
                                
                            # CHANGE TO PAST TENSE BEFORE EXITING
                            step.name = "⚔️ Party Assembled"
                            await step.update()
                            
                    elif node_name == "NarrativeWriterNode":
                        parent_step.name = "📜 Consulting the ancient tomes and penning the lore..."
                        await parent_step.update()
                        
                        # Start with present tense
                        async with cl.Step(name="Writing the epic...", parent_id=parent_step.id) as step:
                            step.output = f"**Title chosen:** {node_state.get('title')}\n\nReviewing lore and formatting markdown..."
                            
                            # CHANGE TO PAST TENSE BEFORE EXITING
                            step.name = "📜 Lore Penned"
                            await step.update()
                    
                    final_state.update(node_state) 
            
            # THE FINAL TOUCH: Update the parent step right before the loading animation stops
            parent_step.name = "🐉 Campaign successfully forged!"
            await parent_step.update()
        
        # ... Formatting and sending the final message remains exactly the same ...
        
        # The parent step finishes here, spinner stops.
        
        # ... Formatting and sending the final message remains exactly the same ...
        
        # 4. The Parent Step block ends here, stopping the loading animation automatically.
        
        # Format the fully accumulated state
        formatted_output = format_campaign_output(final_state)
        
        # Save characters to session memory
        if "party_details" in final_state and "characters" in final_state["party_details"]:
            state["characters"] = final_state["party_details"]["characters"]
            cl.user_session.set("campaign_params", state)

        chat_history = cl.user_session.get("chat_history", [])
            
        chat_history.append(AIMessage(content="Campaign generated successfully."))
        cl.user_session.set("chat_history", chat_history)
        
        # Send the final Markdown message to the main chat
        await cl.Message(content=formatted_output).send()
        
    except Exception as e:
        await cl.Message(content=f"**Error generating campaign:** {str(e)}").send()

def format_campaign_output(result: dict) -> str:
    title = result.get('title', 'Epic Adventure')
    description = result.get('description', 'An exciting adventure awaits!')
    background = result.get('background', 'The story begins...')
    rewards = result.get('rewards', 'Glory and treasure!')
    terrain = result.get('terrain', 'Unknown')
    difficulty = result.get('difficulty', 'Unknown')
    
    party_data = result.get('party_details', {})
    
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
        f"- **Terrain:** {terrain.title()}",
        f"- **Difficulty:** {difficulty.title()}",
        "",
        "### 🏆 Rewards",
        rewards,
        "",
    ]
    
    if party_data and 'party_name' in party_data:
        lines.append(f"### ⚔️ Party: {party_data['party_name']} ({party_data.get('party_size', 4)} adventurers)")
        lines.append("") 
        
        characters = party_data.get('characters', [])
        for i, char in enumerate(characters, 1):
            name = char.get('name', f'Hero {i}')
            race = char.get('race', 'Unknown')
            char_class = char.get('class', 'Adventurer')
            level = char.get('level', 1)
            alignment = char.get('alignment', 'True Neutral')
            quote = char.get('flavor_quote', 'Lets roll for initiative!')
            
            # Character Header
            lines.append(f"### 🛡️ {name}")
            lines.append(f"**Level {level} {race} {char_class}** • *{alignment}*")
            lines.append(f"> \"{quote}\"")
            lines.append("")
            
            # Render stats as Markdown table if they exist
            stats = char.get('ability_scores', {})
            if stats:
                stat_string = f"**STR** {stats.get('STR', 10)} ｜ **DEX** {stats.get('DEX', 10)} ｜ **CON** {stats.get('CON', 10)} ｜ **INT** {stats.get('INT', 10)} ｜ **WIS** {stats.get('WIS', 10)} ｜ **CHA** {stats.get('CHA', 10)}"
                lines.append(stat_string)
                lines.append("")

            # Bulleted Traits
            # Narrative Hook
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
            if char.get('skills'): 
                mechanics.append(f"**Skills:** {char['skills']}")
            if char.get('weapons'): 
                mechanics.append(f"**Weapons:** {char['weapons']}")
            if char.get('inventory'): 
                mechanics.append(f"**Inventory:** {char['inventory']}")
            
            if mechanics:
                lines.append(" • ".join(mechanics))
            
            # Force paragraph break
            lines.append("") 
            lines.append("---")
            lines.append("")

    return "\n".join(lines)

# --- Chainlit App ---

@cl.on_chat_start
async def on_chat_start():
    cl.user_session.set("campaign_params", {
        "party_name": None, "party_size": None, "terrain": None, 
        "difficulty": None, "requirements": "", "characters": [], "roster_locked": True
    })
    cl.user_session.set("chat_history", [])

    settings = await cl.ChatSettings([
        TextInput(id = "party_name", label = "Party Name", placeholder = "The Nameless", tooltip = "What is the name of your adventuring party? Leave it empty if you'd like AI to come up with one."),
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
    state = cl.user_session.get("campaign_params", {})

    await generate_campaign(state)

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
        # Fallbacks to prevent Pydantic crashes if the user forces generation early
        await generate_campaign(state)

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