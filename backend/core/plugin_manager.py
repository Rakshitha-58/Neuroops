"""Plugin architecture for NeuroOps Phase 3.

Built-in plugins register automatically and expose a small capability surface for
future integrations with GitHub, Slack, Discord, Gmail, Calendar, Jira, Notion,
and Google Drive. The implementation is intentionally lightweight so the core
workflow remains deterministic without external credentials.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from core.event_bus import event_bus


class BasePlugin(ABC):
    """Simple plugin contract."""

    name: str = "plugin"
    category: str = "integration"
    description: str = ""
    capabilities: List[str] = []

    def __init__(self) -> None:
        self.enabled = True
        self.last_error: Optional[str] = None

    @abstractmethod
    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError

    def status(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "category": self.category,
            "description": self.description,
            "capabilities": list(self.capabilities),
            "enabled": self.enabled,
            "last_error": self.last_error,
        }


class GitHubPlugin(BasePlugin):
    name = "github"
    category = "developer"
    description = "Repository and PR orchestration hooks"
    capabilities = ["repo_sync", "issue_tracking", "pull_request_review"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "GitHub integration ready"}


class SlackPlugin(BasePlugin):
    name = "slack"
    category = "communication"
    description = "Team notifications and status updates"
    capabilities = ["message_send", "channel_broadcast"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Slack integration ready"}


class DiscordPlugin(BasePlugin):
    name = "discord"
    category = "communication"
    description = "Community and bot integrations"
    capabilities = ["message_send", "guild_alerts"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Discord integration ready"}


class GmailPlugin(BasePlugin):
    name = "gmail"
    category = "communication"
    description = "Email dispatch and inbox monitoring"
    capabilities = ["send_email", "label_sync"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Gmail integration ready"}


class CalendarPlugin(BasePlugin):
    name = "calendar"
    category = "productivity"
    description = "Calendar scheduling and agenda awareness"
    capabilities = ["schedule_event", "reminder_sync"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Calendar integration ready"}


class JiraPlugin(BasePlugin):
    name = "jira"
    category = "project_management"
    description = "Task tracking and issue lifecycle"
    capabilities = ["issue_create", "status_sync"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Jira integration ready"}


class NotionPlugin(BasePlugin):
    name = "notion"
    category = "knowledge"
    description = "Knowledge base and docs synchronization"
    capabilities = ["page_create", "database_sync"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Notion integration ready"}


class GoogleDrivePlugin(BasePlugin):
    name = "google_drive"
    category = "storage"
    description = "File and document storage operations"
    capabilities = ["file_upload", "folder_sync"]

    def execute(self, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {"ok": True, "plugin": self.name, "action": action, "message": "Google Drive integration ready"}


class PluginManager:
    """Auto-registers built-in plugins and exposes a simple execution interface."""

    def __init__(self) -> None:
        self._plugins: Dict[str, BasePlugin] = {}
        self._register_builtin_plugins()

    def _register_builtin_plugins(self) -> None:
        for plugin in [
            GitHubPlugin(),
            SlackPlugin(),
            DiscordPlugin(),
            GmailPlugin(),
            CalendarPlugin(),
            JiraPlugin(),
            NotionPlugin(),
            GoogleDrivePlugin(),
        ]:
            self.register(plugin)

    def register(self, plugin: BasePlugin) -> None:
        self._plugins[plugin.name] = plugin
        event_bus.emit(
            "plugin:registered",
            source="PluginManager",
            message=f"Registered plugin: {plugin.name}",
            data={"plugin": plugin.name, "category": plugin.category},
        )

    def list_plugins(self) -> List[Dict[str, Any]]:
        return [plugin.status() for plugin in self._plugins.values()]

    def get_plugin(self, name: str) -> Optional[BasePlugin]:
        return self._plugins.get(name)

    def execute(self, plugin_name: str, action: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        plugin = self.get_plugin(plugin_name)
        if not plugin:
            return {"ok": False, "error": f"unknown plugin: {plugin_name}"}
        try:
            result = plugin.execute(action, payload)
            event_bus.emit(
                "plugin:executed",
                source="PluginManager",
                message=f"Executed plugin {plugin_name}:{action}",
                data={"plugin": plugin_name, "action": action, "result": result},
            )
            return result
        except Exception as exc:  # pragma: no cover - defensive path
            plugin.last_error = str(exc)
            return {"ok": False, "plugin": plugin_name, "error": str(exc)}


plugin_manager = PluginManager()
