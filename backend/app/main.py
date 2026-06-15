"""FastAPI backend for Sports Coach dashboard."""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import cache, intervals_client
from .config import settings
from .processors import hr_drift, intensity, run_progression, interference, climb_vam, pace_hr, equiv_speed
from . import report as report_module

log = logging.getLogger(__name__)

# Built React frontend — present in production (Docker), absent in dev
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend_dist"


async def _daily_sync_loop():
    """Fire a sync once per day at settings.sync_hour (default 06:00)."""
    while True:
        now = datetime.now()
        target = now.replace(hour=settings.sync_hour, minute=0, second=0, microsecond=0)
        if target <= now:
            target += timedelta(days=1)
        wait = (target - now).total_seconds()
        log.info("Daily sync scheduled in %.0f s (at %s)", wait, target.strftime("%H:%M"))
        await asyncio.sleep(wait)
        log.info("Running scheduled daily sync…")
        try:
            await _run_sync()
        except Exception as exc:
            log.error("Daily sync failed: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_daily_sync_loop())
    yield
    task.cancel()


app = FastAPI(title="Sports Coach API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_sync_lock = asyncio.Lock()


# ── Sync ─────────────────────────────────────────────────────────────────────

async def _run_sync():
    state = cache.load_sync_state()
    state["is_syncing"] = True
    cache.save_sync_state(state)

    try:
        # Fetch athlete profile
        athlete_data = await intervals_client.get_athlete()
        # Try to get HR zones from athlete-settings
        try:
            athlete_settings = await intervals_client.get_athlete_settings()
            # Merge: athlete profile + settings
            merged = {**athlete_data, **athlete_settings}
        except Exception:
            merged = athlete_data
        cache.save_athlete(merged)

        # Fetch all activities
        all_activities = await intervals_client.get_activities()
        cache.save_activities(all_activities)

        # Fetch wellness
        wellness = await intervals_client.get_wellness()
        cache.save_wellness(wellness)

        # Determine which streams need fetching
        cached_ids = cache.cached_stream_ids()
        missing_ids = [
            str(a["id"])
            for a in all_activities
            if str(a.get("id", "")) not in cached_ids
            and a.get("average_heartrate")  # only fetch activities that have HR
        ]

        total = len(missing_ids)
        state["total"] = total
        cache.save_sync_state(state)

        # Fetch streams in batches of 10
        batch_size = 10
        synced = 0
        for i in range(0, len(missing_ids), batch_size):
            batch = missing_ids[i : i + batch_size]
            streams = await intervals_client.fetch_streams_batch(batch)
            for aid, stream in streams.items():
                cache.save_stream(aid, stream)
            synced += len(batch)
            cache.update_sync_progress(synced, total)

        state = cache.load_sync_state()
        state["is_syncing"] = False
        state["last_sync"] = date.today().isoformat()
        state["progress"] = total
        cache.save_sync_state(state)

    except Exception as e:
        state = cache.load_sync_state()
        state["is_syncing"] = False
        state["error"] = str(e)
        cache.save_sync_state(state)
        raise


@app.post("/api/sync")
async def trigger_sync(background_tasks: BackgroundTasks):
    if _sync_lock.locked():
        return {"status": "already_running"}
    background_tasks.add_task(_run_sync_with_lock)
    return {"status": "started"}


async def _run_sync_with_lock():
    async with _sync_lock:
        await _run_sync()


@app.get("/api/sync/status")
def sync_status():
    state = cache.load_sync_state()
    acts = cache.load_activities()
    streamed = len(cache.cached_stream_ids())
    return {
        "total_activities": len(acts),
        "synced_streams": streamed,
        "last_sync": state.get("last_sync"),
        "is_syncing": state.get("is_syncing", False),
        "progress": state.get("progress", 0),
        "total_to_sync": state.get("total", 0),
        "error": state.get("error"),
    }


# ── Athlete ───────────────────────────────────────────────────────────────────

@app.get("/api/athlete")
def get_athlete():
    data = cache.load_athlete()
    if not data:
        raise HTTPException(404, "Athlete not synced yet. Run /api/sync first.")
    athlete_id = data.get("id") or settings.athlete_id
    max_hr = data.get("max_hr") or data.get("maxHR") or 190
    rest_hr = data.get("restHR") or data.get("resting_hr") or 50
    return {
        "id": athlete_id,
        "name": data.get("name", "Athlete"),
        "max_hr": max_hr,
        "rest_hr": rest_hr,
    }


# ── Analytics ─────────────────────────────────────────────────────────────────

@app.get("/api/hr-drift")
def get_hr_drift(start: Optional[str] = None, end: Optional[str] = None):
    return hr_drift.compute(settings.run_segment_seconds, settings.ride_segment_seconds, start=start, end=end)


@app.get("/api/intensity")
def get_intensity(start: Optional[str] = None, end: Optional[str] = None):
    return intensity.compute(start=start, end=end)


@app.get("/api/run-progression")
def get_run_progression(start: Optional[str] = None, end: Optional[str] = None):
    return run_progression.compute(start=start, end=end)


@app.get("/api/interference")
def get_interference(start: Optional[str] = None, end: Optional[str] = None):
    return interference.compute(start=start, end=end)


@app.get("/api/climb-vam")
def get_climb_vam(start: Optional[str] = None, end: Optional[str] = None):
    return climb_vam.compute(start=start, end=end)


@app.get("/api/pace-hr")
def get_pace_hr(start: Optional[str] = None, end: Optional[str] = None):
    return pace_hr.compute(start=start, end=end)


@app.get("/api/equiv-speed")
def get_equiv_speed(start: Optional[str] = None, end: Optional[str] = None):
    return equiv_speed.compute(start=start, end=end)


@app.get("/api/wellness")
def get_wellness():
    entries = cache.load_wellness()
    if not entries:
        return {"daily": [], "trends": {}}

    def f(e, key):
        return e.get(key)

    daily = [
        {
            "date": e.get("id", "")[:10],
            "hrv": f(e, "hrv") or f(e, "hrvSdnn"),
            "sleep_score": f(e, "sleepScore") or f(e, "sleep_score"),
            "sleep_hours": round(float(e["sleepSeconds"]) / 3600, 2) if e.get("sleepSeconds") else None,
            "weight_kg": f(e, "weight"),
            "resting_hr": f(e, "restingHR") or f(e, "resting_hr"),
        }
        for e in entries
        if e.get("id")
    ]
    daily.sort(key=lambda x: x["date"])

    def _trend(key, window=30):
        vals = [(d["date"], d[key]) for d in daily[-window:] if d.get(key) is not None]
        return [{"date": v[0], "value": v[1]} for v in vals]

    return {
        "daily": daily[-365:],
        "trends": {
            "hrv_7d_avg": _trend("hrv"),
            "weight_trend": _trend("weight_kg"),
            "sleep_trend": _trend("sleep_score"),
        },
    }


# ── Report ────────────────────────────────────────────────────────────────────

@app.post("/api/generate-report")
def generate_report():
    md_path, json_path = report_module.generate()
    return {
        "status": "ok",
        "markdown_file": str(md_path),
        "json_file": str(json_path),
    }


# ── Frontend (production only — dev uses Vite) ────────────────────────────────
# Mounted AFTER all /api routes so they take priority.

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="static_assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(str(FRONTEND_DIST / "index.html"))
