"""NeuroOps scheduler routes."""
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from database import SessionLocal
from models import ScheduleEntry
from utils import handle_errors

scheduler_bp = Blueprint("scheduler", __name__, url_prefix="/api/scheduler")


@scheduler_bp.route("", methods=["GET"])
@handle_errors
def list_schedules():
    session = SessionLocal()
    try:
        return jsonify([s.to_dict() for s in session.query(ScheduleEntry).all()])
    finally:
        session.close()


@scheduler_bp.route("", methods=["POST"])
@handle_errors
def create_schedule():
    data = request.get_json(force=True)
    session = SessionLocal()
    try:
        entry = ScheduleEntry(
            name=data.get("name", "unnamed-job"),
            task_title=data.get("task_title", "Scheduled task"),
            interval_seconds=int(data.get("interval_seconds", 60)),
            enabled=data.get("enabled", True),
            next_run=datetime.utcnow() + timedelta(seconds=int(data.get("interval_seconds", 60))),
        )
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return jsonify(entry.to_dict()), 201
    finally:
        session.close()


@scheduler_bp.route("/<int:schedule_id>", methods=["DELETE"])
@handle_errors
def delete_schedule(schedule_id):
    session = SessionLocal()
    try:
        entry = session.query(ScheduleEntry).filter(ScheduleEntry.id == schedule_id).first()
        if not entry:
            return jsonify({"error": "not found"}), 404
        session.delete(entry)
        session.commit()
        return jsonify({"deleted": schedule_id})
    finally:
        session.close()


@scheduler_bp.route("/<int:schedule_id>/toggle", methods=["POST"])
@handle_errors
def toggle_schedule(schedule_id):
    session = SessionLocal()
    try:
        entry = session.query(ScheduleEntry).filter(ScheduleEntry.id == schedule_id).first()
        if not entry:
            return jsonify({"error": "not found"}), 404
        entry.enabled = not entry.enabled
        session.commit()
        return jsonify(entry.to_dict())
    finally:
        session.close()
