"""Local JSON cache for activities, streams, wellness, and athlete profile."""
import json
from pathlib import Path
from datetime import datetime
from typing import Optional
from .config import settings

ACTIVITIES_FILE = settings.data_dir / "activities.json"
WELLNESS_FILE = settings.data_dir / "wellness.json"
ATHLETE_FILE = settings.data_dir / "athlete.json"
STREAMS_DIR = settings.data_dir / "streams"
SYNC_STATE_FILE = settings.data_dir / "sync_state.json"


def _load(path: Path) -> Optional[dict | list]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return None


def _save(path: Path, data: dict | list):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


# ── Activities ──────────────────────────────────────────────────────────────

def load_activities() -> list[dict]:
    return _load(ACTIVITIES_FILE) or []


def save_activities(activities: list[dict]):
    _save(ACTIVITIES_FILE, activities)


def get_cached_activity_ids() -> set[str]:
    return {a["id"] for a in load_activities()}


# ── Streams ──────────────────────────────────────────────────────────────────

def load_stream(activity_id: str) -> Optional[dict]:
    p = STREAMS_DIR / f"{activity_id}.json"
    return _load(p)


def save_stream(activity_id: str, stream: dict):
    _save(STREAMS_DIR / f"{activity_id}.json", stream)


def cached_stream_ids() -> set[str]:
    return {p.stem for p in STREAMS_DIR.glob("*.json")}


# ── Wellness ──────────────────────────────────────────────────────────────────

def load_wellness() -> list[dict]:
    return _load(WELLNESS_FILE) or []


def save_wellness(entries: list[dict]):
    _save(WELLNESS_FILE, entries)


# ── Athlete ──────────────────────────────────────────────────────────────────

def load_athlete() -> Optional[dict]:
    return _load(ATHLETE_FILE)


def save_athlete(data: dict):
    _save(ATHLETE_FILE, data)


# ── Sync state ────────────────────────────────────────────────────────────────

def load_sync_state() -> dict:
    return _load(SYNC_STATE_FILE) or {"last_sync": None, "is_syncing": False, "progress": 0, "total": 0}


def save_sync_state(state: dict):
    _save(SYNC_STATE_FILE, state)


def update_sync_progress(synced: int, total: int):
    state = load_sync_state()
    state["progress"] = synced
    state["total"] = total
    save_sync_state(state)
