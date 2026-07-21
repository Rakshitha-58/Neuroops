# NeuroOps - Autonomous AI Workforce for Software Teams

Phase 1 foundation: a modular Flask + Socket.IO backend with a SQLite database
and a vanilla JavaScript frontend dashboard.

## Tech Stack

- **Backend**: Python, Flask, Flask-SocketIO, SQLAlchemy, SQLite
- **Frontend**: HTML, CSS, Vanilla JavaScript (no React, Next.js, Firebase, or Supabase)

## Folder Structure

```
neuroops/
├── backend/
│   ├── app.py              # Flask + Socket.IO entry point
│   ├── config.py           # Configuration (dev/prod/test)
│   ├── requirements.txt    # Python dependencies
│   ├── api/                # REST API blueprint (tasks, health, stats)
│   ├── agents/             # Agent management blueprint + memory endpoints
│   ├── scheduler/          # Scheduler blueprint + background runner
│   ├── services/           # AgentService, TaskService
│   ├── memory/             # MemoryService (persistent + in-memory cache)
│   ├── database/           # SQLAlchemy engine, session, Base
│   ├── models/             # Agent, Task, MemoryEntry, ScheduleEntry
│   └── utils/              # Logging, error handling, emit helpers
├── frontend/
│   ├── index.html          # Dashboard UI
│   ├── style.css           # Theme + responsive layout
│   └── script.js           # REST + Socket.IO client
├── assets/
└── package.json            # build/start scripts
```

## Getting Started

### Install dependencies
```bash
pip install -r backend/requirements.txt
```

### Run the server
```bash
python3 backend/app.py
# or
npm start
```

The server starts on `http://localhost:5000` (override with `PORT=<port>`).
The SQLite database (`backend/neuroops.db`) is created automatically on first run.

### Build check
```bash
npm run build
```

## API Reference

### Core
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/api/health` | Health check |
| GET  | `/api/stats` | Counts of agents, tasks, schedules |

### Tasks
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/tasks` | List tasks (filter with `?status=`) |
| POST   | `/api/tasks` | Create task `{title, description, priority}` |
| GET    | `/api/tasks/<id>` | Get a task |
| DELETE | `/api/tasks/<id>` | Delete a task |
| POST   | `/api/tasks/<id>/complete` | Mark complete `{result}` |

### Agents
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/agents` | List agents |
| POST   | `/api/agents` | Register `{name, role, capabilities, config}` |
| GET    | `/api/agents/<id>` | Get an agent |
| POST   | `/api/agents/<id>/heartbeat` | Update heartbeat |
| POST   | `/api/agents/<id>/assign/<task_id>` | Assign a task |
| GET    | `/api/agents/<id>/memory` | Recall memories (`?category=`) |
| POST   | `/api/agents/<id>/memory` | Store `{category, content, metadata}` |
| DELETE | `/api/memory/<id>` | Forget a memory |

### Scheduler
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/scheduler` | List schedules |
| POST   | `/api/scheduler` | Create `{name, task_title, interval_seconds}` |
| DELETE | `/api/scheduler/<id>` | Delete a schedule |
| POST   | `/api/scheduler/<id>/toggle` | Enable/disable |

## Socket.IO Events

- `server:hello` - emitted on connect
- `server:pong` - response to `client:ping`
- `scheduler:fired` - emitted when a scheduled job creates a task

## Architecture Notes

- **Modular blueprints**: `api`, `agents`, `scheduler` are independent Flask blueprints.
- **MemoryService**: persistent storage in `memory_entries` plus an in-memory ring buffer for fast recall.
- **Scheduler**: a daemon thread polls `ScheduleEntry` rows and creates tasks when due, emitting Socket.IO events.
- **Database**: SQLAlchemy with SQLite; tables auto-created via `init_db()` on startup.

## Phase 1 Status

This phase delivers the complete project foundation: folder structure, Flask app,
SQLAlchemy + SQLite database, Socket.IO real-time layer, modular blueprints,
Memory Service, scheduler, services, utils, and a connected frontend dashboard.
