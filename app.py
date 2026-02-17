
from typing import Literal, Any, Annotated, TypedDict
import chainlit as cl

from langchain_core.messages import HumanMessage, BaseMessage, SystemMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from langgraph.graph.message import BaseMessage, add_messages
from langgraph.graph import START, END, StateGraph
from langgraph.checkpoint.memory import MemorySaver

from dotenv import load_dotenv
load_dotenv()

# define model
model = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0
)

# Create a simple state graph
class DnDChatbotState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]    

# Create a node for stater graph
async def dnd_chatbot(state: DnDChatbotState):
    response = await model.ainvoke(state["messages"])
    return {"messages":[response]}

# initialize state graph
graph = StateGraph(DnDChatbotState)
graph.add_node("DND_Chatbot", dnd_chatbot)
graph.add_edge(START, "DND_Chatbot")
graph.add_edge("DND_Chatbot", END)

memory = MemorySaver()
app = graph.compile(checkpointer=memory)

@cl.on_message
async def on_message(message: cl.Message):
    system_prompt = """You are a dungeon master for a Dungeons and Dragons game. 
    You are responsible to give a quest to the player. Describe the quest, the game world and the rewards for the quest.
    You will respond to the player's messages and clarify the quest if needed. Be creative and immersive in your responses. 
    """
    config = {
        "configurable": {"thread_id":cl.context.session.id}
    }
    
    state = app.get_state(config)
    messages = state.values.get("messages", []) if state else []

    if not messages or not any(isinstance(message, SystemMessage) for message in messages):
        messages = [SystemMessage(content=system_prompt)] + messages
      
    messages.append(HumanMessage(content=message.content))
    
    inputs = {
        "messages": messages
    }
    
    response = await app.ainvoke(inputs, config)
    await cl.Message(content=response["messages"][-1].content).send()
