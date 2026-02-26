# DnD Quest Provider

AI-assisted Dungeons & Dragons campaign generator with a full-stack workflow:

- **Frontend**: Next.js app for campaign creation, thread history, chat, and PDF export
- **Backend API**: FastAPI + LangGraph orchestration for planning, party generation, narrative writing, and streaming status/events
- **MCP Server**: D&D knowledge tools served over SSE for structured tool access

---

## Table of Contents

- [What This Project Does](#what-this-project-does)
- [Architecture](#architecture)
- [Repository Layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick Start (All Services)](#quick-start-all-services)
- [Manual Startup (Service by Service)](#manual-startup-service-by-service)
- [Configuration](#configuration)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)

---

## What This Project Does

The app generates complete campaign packets from a prompt and settings like difficulty/terrain:

1. Creates a **structured campaign plan** (villain, conflict, plot points, locations)
2. Builds a **party roster** and character sheets
3. Generates **narrative content** (title, description, lore, rewards)
4. Supports **human-in-the-loop branching** before finalizing
5. Persists threads in SQLite and supports **resume/chat by thread ID**
6. Exports campaign output to **print-safe PDF**

---

## Architecture

### Runtime services

- `frontend` (Next.js) on **http://localhost:3000**
- `main.py` (FastAPI) on **http://localhost:8001**
- `dnd-mcp/dnd_mcp_server.py` (MCP over SSE) on **http://localhost:8000/sse**

### Core flow

1. Frontend calls `POST /generate` on FastAPI
2. FastAPI runs the LangGraph pipeline in `dnd.py`
3. Pipeline optionally uses MCP tools via SSE session
4. FastAPI streams progress/events back to frontend (SSE)
5. Final campaign state is persisted in SQLite checkpoint storage (`db/state.db`)

---

## Repository Layout

```text
.
├── main.py                    # FastAPI server + SSE streaming endpoints
├── dnd.py                     # LangGraph workflow and AI generation nodes
├── start_all.sh               # Starts MCP, API, and frontend together
├── db/
│   ├── init.sql               # SQL schema helpers
│   └── state.db               # Runtime state/checkpoints (generated at runtime)
├── frontend/                  # Next.js UI
│   ├── app/page.tsx           # Main generation/chat UI
│   └── app/components/        # UI components (export, sidebar, cards, etc.)
└── dnd-mcp/                   # MCP server package and docs
		├── dnd_mcp_server.py      # MCP server entrypoint
		├── src/                   # MCP core, attribution, templates, query enhancements
		├── tests/                 # MCP unit/integration tests
		└── docs/                  # MCP-focused documentation
```

---

## Prerequisites

- **macOS/Linux** (or WSL on Windows)
- **Python 3.13+** (as declared in `pyproject.toml`)
- **Node.js 20+** and npm
- **uv** package manager (recommended for Python workflows)
- Browser binaries for Playwright PDF export:
	- `uv run playwright install chromium`

> If `uv` is not installed: https://docs.astral.sh/uv/getting-started/installation/

---

## Quick Start (All Services)

From repo root:

```bash
# 1) Install Python dependencies
uv sync

# 2) Install frontend dependencies
cd frontend && npm install && cd ..

# 3) Install Chromium for backend PDF export
uv run playwright install chromium

# 4) Start everything (MCP + API + frontend)
./start_all.sh
```

Then open:

- Frontend: http://localhost:3000
- API health: http://localhost:8001/health

Press `Ctrl+C` in the terminal running `start_all.sh` to stop all services.

---

## Manual Startup (Service by Service)

Use this if you prefer separate terminals.

### Terminal 1 — MCP Server

```bash
uv run dnd-mcp/dnd_mcp_server.py
```

### Terminal 2 — FastAPI Backend

```bash
uv run uvicorn main:app --port 8001 --reload
```

### Terminal 3 — Next.js Frontend

```bash
cd frontend
npm run dev:clean
```

---

## Configuration

### Environment variables

The generation stack uses Google GenAI/LangChain models in `dnd.py`, so set your Google API credentials in your shell or `.env` file:

```bash
GOOGLE_API_KEY=your_key_here
```

If model calls fail, verify this variable first.

### CORS

`main.py` currently allows requests from:

- `http://localhost:3000`

If you run the frontend elsewhere, update CORS config in `main.py`.

---

## API Endpoints

Main routes exposed by FastAPI (`main.py`):

- `GET /health` — basic health check
- `POST /generate` — starts/resumes campaign generation; streams SSE events
- `GET /threads` — list recent campaign threads
- `GET /threads/{thread_id}` — retrieve saved campaign state + chat
- `PATCH /threads/{thread_id}/archive` — toggle archive flag
- `POST /threads/{thread_id}/chat` — continue chat in existing campaign
- `POST /export/pdf` — render supplied HTML to downloadable PDF

---

## Troubleshooting

### `POST /generate` fails or stalls

- Ensure MCP server is running on `http://localhost:8000/sse`
- Ensure backend is running on port `8001`
- Ensure `GOOGLE_API_KEY` is set

### PDF export fails

- Install Playwright browser binaries:
	- `uv run playwright install chromium`
- Confirm backend environment has `playwright` installed

### Frontend cannot reach backend

- Verify API URL in frontend calls is `http://localhost:8001`
- Confirm CORS includes your frontend origin

### State/thread issues

- Inspect `db/state.db`
- Remove corrupted local state if needed and restart services

---

## Related Docs

- `chainlit.md` — brief app usage summary
- `docs/how_it_works.md` — deep technical walkthrough of LangGraph, node routing, API streaming, and React state/event flow
- `frontend/README.md` — default Next.js scaffold notes
- `dnd-mcp/README.md` — deep MCP package documentation

---

## Notes for Contributors

- Keep API contracts stable for frontend event parsing (`thread_id`, `plan`, `party`, `narrative`, `hitl`, `status`, `done`, `error`)
- Prefer incremental UI changes in `frontend/app/components/`
- Keep prompt/schema updates in `dnd.py` aligned with frontend assumptions for rendering

