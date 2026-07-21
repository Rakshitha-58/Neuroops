"""NeuroOps database connection and session management."""
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from sqlalchemy.ext.declarative import declarative_base

from config import Config

engine = create_engine(
    Config.SQLALCHEMY_DATABASE_URI,
    connect_args={"check_same_thread": False},
    future=True,
)

SessionLocal = scoped_session(
    sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
)

Base = declarative_base()


def init_db():
    """Create all tables defined on Base."""
    import models  # noqa: F401  ensure models are imported
    Base.metadata.create_all(bind=engine)


def get_session():
    """Return a scoped session."""
    return SessionLocal


def shutdown_session(exception=None):
    """Remove the scoped session at request end."""
    SessionLocal.remove()
