from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from datetime import datetime

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./moises_clone.db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class TaskDB(Base):
    __tablename__ = "tasks"
    
    id = Column(String, primary_key=True, index=True)
    original_filename = Column(String)
    file_path = Column(String)
    separation_type = Column(String)
    status = Column(String)
    progress = Column(Integer, default=0)
    stems = Column(Text)  # JSON string
    error = Column(Text)
    bpm = Column(Integer)
    key = Column(String)
    duration = Column(Float)
    chords = Column(Text)  # JSON string
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)


class SeparationCacheDB(Base):
    __tablename__ = "separation_cache"

    cache_key = Column(String, primary_key=True, index=True)
    stems = Column(Text)  # JSON string
    bpm = Column(Integer)
    key = Column(String)
    duration = Column(Float)
    chords = Column(Text)  # JSON string
    key_info = Column(Text)  # JSON string
    model_version = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)

def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_task_columns()


def _ensure_sqlite_task_columns():
    """
    Backward-compatible migration for legacy SQLite databases.
    Adds missing columns used by current backend code paths.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return

    required_columns = {
        "bpm": "INTEGER",
        "key": "VARCHAR",
        "duration": "FLOAT",
        "chords": "TEXT",
    }

    with engine.connect() as conn:
        existing = {
            row[1]
            for row in conn.exec_driver_sql("PRAGMA table_info(tasks)").fetchall()
        }
        for col_name, col_type in required_columns.items():
            if col_name not in existing:
                conn.exec_driver_sql(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_type}")
        conn.commit()

def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
