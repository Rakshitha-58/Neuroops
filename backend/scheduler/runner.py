"""NeuroOps scheduler background runner.

Polls enabled ScheduleEntry rows and emits Socket.IO events when jobs fire.
Runs in a background thread started by app.py.
"""
from datetime import datetime, timedelta
import threading
import time

from database import SessionLocal
from models import ScheduleEntry, Task
from utils import logger


def _run_due_jobs(socketio):
    session = SessionLocal()
    try:
        now = datetime.utcnow()
        due = (
            session.query(ScheduleEntry)
            .filter(ScheduleEntry.enabled.is_(True))
            .filter(ScheduleEntry.next_run <= now)
            .all()
        )
        for entry in due:
            task = Task(title=entry.task_title, status="pending")
            session.add(task)
            entry.last_run = now
            entry.next_run = now + timedelta(seconds=entry.interval_seconds)
            session.commit()
            session.refresh(task)
            logger.info("scheduler fired '%s' -> task #%d", entry.name, task.id)
            socketio.emit(
                "scheduler:fired",
                {"schedule": entry.to_dict(), "task": task.to_dict()},
            )
    except Exception as exc:
        logger.error("scheduler tick failed: %s", exc)
    finally:
        session.close()


def _loop(socketio, interval):
    logger.info("scheduler loop started (interval=%ss)", interval)
    while True:
        try:
            _run_due_jobs(socketio)
        except Exception as exc:  # pragma: no cover
            logger.error("scheduler loop error: %s", exc)
        time.sleep(interval)


def start_scheduler(socketio, interval=10):
    """Start the scheduler background thread. Returns the thread handle."""
    thread = threading.Thread(
        target=_loop, args=(socketio, interval), daemon=True, name="neuroops-scheduler"
    )
    thread.start()
    return thread
