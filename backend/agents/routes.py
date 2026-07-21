"""NeuroOps agent management routes."""
from flask import Blueprint, jsonify, request

from services.agent_service import agent_service
from memory import memory_service
from utils import handle_errors

agents_bp = Blueprint("agents", __name__, url_prefix="/api/agents")


@agents_bp.route("", methods=["GET"])
@handle_errors
def list_agents():
    return jsonify(agent_service.list_agents())


@agents_bp.route("", methods=["POST"])
@handle_errors
def register_agent():
    data = request.get_json(force=True)
    agent = agent_service.register_agent(
        name=data.get("name", "Unnamed Agent"),
        role=data.get("role", "worker"),
        capabilities=data.get("capabilities", []),
        config=data.get("config", {}),
    )
    return jsonify(agent), 201


@agents_bp.route("/<int:agent_id>", methods=["GET"])
@handle_errors
def get_agent(agent_id):
    agent = agent_service.get_agent(agent_id)
    if not agent:
        return jsonify({"error": "not found"}), 404
    return jsonify(agent)


@agents_bp.route("/<int:agent_id>/heartbeat", methods=["POST"])
@handle_errors
def heartbeat(agent_id):
    agent = agent_service.heartbeat(agent_id)
    if not agent:
        return jsonify({"error": "not found"}), 404
    return jsonify(agent)


@agents_bp.route("/<int:agent_id>/assign/<int:task_id>", methods=["POST"])
@handle_errors
def assign_task(agent_id, task_id):
    task = agent_service.assign_task(agent_id, task_id)
    if not task:
        return jsonify({"error": "agent or task not found"}), 404
    return jsonify(task)


# ---- Agent memory ----

@agents_bp.route("/<int:agent_id>/memory", methods=["GET"])
@handle_errors
def recall_memory(agent_id):
    category = request.args.get("category")
    return jsonify(memory_service.recall(agent_id, category=category))


@agents_bp.route("/<int:agent_id>/memory", methods=["POST"])
@handle_errors
def remember_memory(agent_id):
    data = request.get_json(force=True)
    entry = memory_service.remember(
        agent_id,
        category=data.get("category", "general"),
        content=data.get("content", ""),
        metadata=data.get("metadata"),
    )
    return jsonify(entry), 201


@agents_bp.route("/memory/<int:memory_id>", methods=["DELETE"])
@handle_errors
def forget_memory(memory_id):
    if memory_service.forget(memory_id):
        return jsonify({"deleted": memory_id})
    return jsonify({"error": "not found"}), 404
