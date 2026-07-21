"""NeuroOps Memory Service.

Provides short-term and long-term memory for agents backed by the
memory_entries table plus an in-memory ring buffer for fast recall.
"""
from collections import deque
from datetime import datetime

from models import MemoryEntry
from database import SessionLocal


class MemoryService:
    """Manages agent memory: persistent store + in-memory cache."""

    def __init__(self, max_entries=1000):
        self.max_entries = max_entries
        self._cache = {}  # agent_id -> deque of recent entries

    def _cache_for(self, agent_id):
        key = agent_id or 0
        if key not in self._cache:
            self._cache[key] = deque(maxlen=self.max_entries)
        return self._cache[key]

    def remember(self, agent_id, category, content, metadata=None):
        """Persist a memory entry and cache it."""
        session = SessionLocal()
        try:
            entry = MemoryEntry(
                agent_id=agent_id,
                category=category,
                content=content,
                metadata_json=metadata or {},
            )
            session.add(entry)
            session.commit()
            session.refresh(entry)
            self._cache_for(agent_id).append(entry.to_dict())
            return entry.to_dict()
        finally:
            session.close()

    def recall(self, agent_id, category=None, limit=50):
        """Fetch recent memories for an agent."""
        session = SessionLocal()
        try:
            q = session.query(MemoryEntry).filter(
                (MemoryEntry.agent_id == agent_id) if agent_id else MemoryEntry.agent_id.is_(None)
            )
            if category:
                q = q.filter(MemoryEntry.category == category)
            q = q.order_by(MemoryEntry.created_at.desc()).limit(limit)
            return [e.to_dict() for e in q.all()]
        finally:
            session.close()

    def forget(self, memory_id):
        """Delete a memory entry by id."""
        session = SessionLocal()
        try:
            entry = session.query(MemoryEntry).filter(MemoryEntry.id == memory_id).first()
            if not entry:
                return False
            session.delete(entry)
            session.commit()
            return True
        finally:
            session.close()

    def recent_cache(self, agent_id, limit=20):
        """Fast recall from the in-memory ring buffer."""
        cache = self._cache_for(agent_id)
        return list(cache)[-limit:]


memory_service = MemoryService()
