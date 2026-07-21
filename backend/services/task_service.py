"""Task management service."""
from database import SessionLocal
from models import Task


class TaskService:
    """CRUD + lifecycle for tasks."""

    def list_tasks(self, status=None):
        session = SessionLocal()
        try:
            q = session.query(Task)
            if status:
                q = q.filter(Task.status == status)
            return [t.to_dict() for t in q.all()]
        finally:
            session.close()

    def get_task(self, task_id):
        session = SessionLocal()
        try:
            t = session.query(Task).filter(Task.id == task_id).first()
            return t.to_dict() if t else None
        finally:
            session.close()

    def create_task(self, title, description="", priority="medium"):
        session = SessionLocal()
        try:
            t = Task(title=title, description=description, priority=priority)
            session.add(t)
            session.commit()
            session.refresh(t)
            return t.to_dict()
        finally:
            session.close()

    def complete_task(self, task_id, result=""):
        session = SessionLocal()
        try:
            t = session.query(Task).filter(Task.id == task_id).first()
            if not t:
                return None
            t.status = "completed"
            t.result = result
            if t.agent:
                t.agent.status = "idle"
            session.commit()
            return t.to_dict()
        finally:
            session.close()

    def delete_task(self, task_id):
        session = SessionLocal()
        try:
            t = session.query(Task).filter(Task.id == task_id).first()
            if not t:
                return False
            session.delete(t)
            session.commit()
            return True
        finally:
            session.close()


task_service = TaskService()
