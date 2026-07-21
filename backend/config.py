"""NeuroOps configuration."""
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Config:
    """Base configuration."""

    SECRET_KEY = os.environ.get("SECRET_KEY", "neuroops-dev-secret-key")

    # SQLite database
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "sqlite:///" + os.path.join(BASE_DIR, "backend", "neuroops.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Flask-SocketIO
    SOCKETIO_ASYNC_MODE = "threading"

    # Scheduler
    SCHEDULER_INTERVAL_SECONDS = int(os.environ.get("SCHEDULER_INTERVAL_SECONDS", "10"))

    # Memory service
    MEMORY_MAX_ENTRIES = int(os.environ.get("MEMORY_MAX_ENTRIES", "1000"))

    # Agent defaults
    AGENT_HEARTBEAT_SECONDS = int(os.environ.get("AGENT_HEARTBEAT_SECONDS", "30"))


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}


def get_config(name=None):
    env = name or os.environ.get("FLASK_ENV", "development")
    return CONFIG_MAP.get(env, DevelopmentConfig)
