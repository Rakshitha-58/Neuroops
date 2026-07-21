"""NeuroOps REST API routes."""
from flask import Blueprint, jsonify, request

from services.task_service import task_service
from utils import handle_errors

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/health", methods=["GET"])
@handle_errors
def health():
    return jsonify({"status": "ok", "service": "neuroops"})


@api_bp.route("/stats", methods=["GET"])
@handle_errors
def stats():
    from database import SessionLocal
    from models import Agent, Task, ScheduleEntry

    session = SessionLocal()
    try:
        return jsonify({
            "agents": session.query(Agent).count(),
            "tasks": session.query(Task).count(),
            "schedules": session.query(ScheduleEntry).count(),
        })
    finally:
        session.close()


# ---- Tasks ----

@api_bp.route("/tasks", methods=["GET"])
@handle_errors
def list_tasks():
    status = request.args.get("status")
    return jsonify(task_service.list_tasks(status=status))


@api_bp.route("/tasks", methods=["POST"])
@handle_errors
def create_task():
    data = request.get_json(force=True)
    task = task_service.create_task(
        title=data.get("title", "Untitled"),
        description=data.get("description", ""),
        priority=data.get("priority", "medium"),
    )
    return jsonify(task), 201


@api_bp.route("/tasks/<int:task_id>", methods=["GET"])
@handle_errors
def get_task(task_id):
    task = task_service.get_task(task_id)
    if not task:
        return jsonify({"error": "not found"}), 404
    return jsonify(task)


@api_bp.route("/tasks/<int:task_id>", methods=["DELETE"])
@handle_errors
def delete_task(task_id):
    if task_service.delete_task(task_id):
        return jsonify({"deleted": task_id})
    return jsonify({"error": "not found"}), 404


@api_bp.route("/tasks/<int:task_id>/complete", methods=["POST"])
@handle_errors
def complete_task(task_id):
    data = request.get_json(silent=True) or {}
    task = task_service.complete_task(task_id, result=data.get("result", ""))
    if not task:
        return jsonify({"error": "not found"}), 404
    return jsonify(task)
