import asyncio
import copy
from dnd import CampaignState, planner_node
from langchain_core.messages import HumanMessage
import json

def run():
    state = CampaignState(
        messages=[HumanMessage(content="test")],
        terrain="Forest",
        difficulty="Medium",
        requirements="",
        party_details=None,
        campaign_plan=None
    )
    result = planner_node(state)
    print("Planner node output keys:", result.keys())
    
    plan = result["campaign_plan"]
    print("Deepcopying plan directly...")
    try:
        copy.deepcopy(plan)
        print("Plan deepcopied successfully.")
    except Exception as e:
        print(f"Failed to deepcopy plan! {e}")

    print("Deepcopying state directly...")
    state.campaign_plan = plan
    try:
        copy.deepcopy(state)
        print("State deepcopied successfully.")
    except Exception as e:
        print(f"Failed to deepcopy state! {e}")

if __name__ == "__main__":
    run()
