#!/bin/bash
echo "Starting D&D MCP Server (SSE Backend) on port 8000..."
.venv/bin/python dnd-mcp/dnd_mcp_server.py &
MCP_PID=$!

# Wait for server to start
sleep 2

echo "Starting Chainlit Web Interface on port 8001..."
.venv/bin/python -m chainlit run app.py -w --port 8001

# When chainlit exits, kill the MCP server
kill $MCP_PID
