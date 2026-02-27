import asyncio
import pickle
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
    print("Pickling plan directly...")
    try:
        pickle.dumps(plan)
        print("Plan pickled successfully.")
    except Exception as e:
        print(f"Failed to pickle plan! {e}")

    print("Pickling state directly...")
    state.campaign_plan = plan
    try:
        pickle.dumps(state)
        print("State pickled successfully.")
    except Exception as e:
        print(f"Failed to pickle state! {e}")

if __name__ == "__main__":
    run()
