import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.memory_service import memory_service
from core.performance_analytics import performance_analytics
from core.model_provider import ModelManager, model_manager
from api.workflow_routes import build_prompt_output


def test_memory_and_analytics_helpers():
    memory_service.store_episode("phase3 test episode", agent_id="test-agent")
    memory_service.store_project_state("phase3 project checkpoint", metadata={"project": "demo"})
    stats = performance_analytics.get_system_stats()
    assert stats["total_tasks"] >= 0
    assert isinstance(model_manager.provider_name, str)


def test_runtime_model_configuration_and_prompt_output():
    manager = ModelManager()
    manager.configure("stub", "", "stub-v1")
    response = manager.generate("You are a helpful assistant", "Please help me debug a failing API request")
    assert response.provider == "stub"
    assert "debug" in response.content.lower() or "general task" in response.content.lower()

    output = build_prompt_output("Create a dashboard for the finance team", provider="stub", api_key="", model_name="stub-v1")
    assert "dashboard" in output.lower()
    assert "stub" in output.lower()
