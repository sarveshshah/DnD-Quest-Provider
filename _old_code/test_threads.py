import asyncio
from main import get_threads
import sys

async def main():
    try:
        await get_threads()
        print("Success")
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
