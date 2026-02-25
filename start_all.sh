#!/bin/bash

# Define cleanup function
cleanup() {
    echo "Shutting down servers..."
    kill $MCP_PID
    kill $API_PID
    kill $FRONTEND_PID
    wait $MCP_PID 2>/dev/null
    wait $API_PID 2>/dev/null
    wait $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap SIGINT (Ctrl+C) and SIGTERM
trap cleanup SIGINT SIGTERM

echo "Starting D&D MCP Server (SSE Backend) on port 8000..."
uv run dnd-mcp/dnd_mcp_server.py &
MCP_PID=$!

# Wait for MCP server to start
sleep 2

echo "Starting FastAPI Backend on port 8001..."
uv run uvicorn main:app --port 8001 --reload &
API_PID=$!

echo "Starting Next.js Frontend on port 3000..."
cd frontend && npm run dev &
FRONTEND_PID=$!

# Wait indefinitely until interrupted
echo "All servers running! Press Ctrl+C to stop."
wait
