"""Agent lifecycle service: registration, heartbeat, task assignment."""
from datetime import datetime

from database import SessionLocal
from models import Agent, Task


class AgentService:
    """High-level operations on agents."""

    def list_agents(self):
        session = SessionLocal()
        try:
            return [a.to_dict() for a in session.query(Agent).all()]
        finally:
            session.close()

    def get_agent(self, agent_id):
        session = SessionLocal()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            return agent.to_dict() if agent else None
        finally:
            session.close()

    def register_agent(self, name, role, capabilities=None, config=None):
        session = SessionLocal()
        try:
            agent = Agent(
                name=name,
                role=role,
                capabilities=capabilities or [],
                config=config or {},
                status="idle",
            )
            session.add(agent)
            session.commit()
            session.refresh(agent)
            return agent.to_dict()
        finally:
            session.close()

    def heartbeat(self, agent_id):
        session = SessionLocal()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            if not agent:
                return None
            agent.last_heartbeat = datetime.utcnow()
            session.commit()
            return agent.to_dict()
        finally:
            session.close()

    def assign_task(self, agent_id, task_id):
        session = SessionLocal()
        try:
            agent = session.query(Agent).filter(Agent.id == agent_id).first()
            task = session.query(Task).filter(Task.id == task_id).first()
            if not agent or not task:
                return None
            task.agent_id = agent_id
            task.status = "assigned"
            agent.status = "busy"
            session.commit()
            return task.to_dict()
        finally:
            session.close()


agent_service = AgentService()
