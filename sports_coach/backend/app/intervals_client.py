import httpx
import asyncio
from typing import Optional
from .config import settings

BASE_URL = "https://intervals.icu"
AUTH = ("API_KEY", settings.intervals_api_key)


async def _get(client: httpx.AsyncClient, path: str, params: dict = None) -> dict | list:
    r = await client.get(f"{BASE_URL}{path}", auth=AUTH, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


async def get_athlete() -> dict:
    async with httpx.AsyncClient() as client:
        return await _get(client, f"/api/v1/athlete/{settings.athlete_id}")


async def get_athlete_settings() -> dict:
    async with httpx.AsyncClient() as client:
        return await _get(client, f"/api/v1/athlete/{settings.athlete_id}/athlete-settings")


async def get_activities(oldest: str = "2000-01-01", newest: str = None) -> list[dict]:
    """Fetch all activities. Returns list sorted oldest→newest."""
    from datetime import date
    if newest is None:
        newest = date.today().isoformat()
    params = {"oldest": oldest, "newest": newest}
    async with httpx.AsyncClient() as client:
        return await _get(client, f"/api/v1/athlete/{settings.athlete_id}/activities", params)


async def get_activity_streams(activity_id: str) -> Optional[dict]:
    """Fetch time-series streams for a single activity. Returns None if unavailable."""
    async with httpx.AsyncClient() as client:
        try:
            data = await _get(
                client,
                f"/api/v1/activity/{activity_id}/streams",
                {"types": "time,heartrate,distance,altitude,velocity_smooth,grade_smooth,watts"},
            )
            # Normalise: intervals.icu may return a list of {type, data} objects
            if isinstance(data, list):
                return {item["type"]: item["data"] for item in data if "type" in item and "data" in item}
            return data
        except (httpx.HTTPStatusError, httpx.RequestError):
            return None


async def get_wellness(oldest: str = "2000-01-01", newest: str = None) -> list[dict]:
    from datetime import date
    if newest is None:
        newest = date.today().isoformat()
    async with httpx.AsyncClient() as client:
        return await _get(
            client,
            f"/api/v1/athlete/{settings.athlete_id}/wellness",
            {"oldest": oldest, "newest": newest},
        )


async def fetch_streams_batch(activity_ids: list[str], max_concurrent: int = 5) -> dict[str, dict]:
    """Fetch streams for multiple activities with concurrency limit and rate limiting."""
    sem = asyncio.Semaphore(max_concurrent)
    results = {}

    async def fetch_one(aid: str):
        async with sem:
            stream = await get_activity_streams(aid)
            if stream:
                results[aid] = stream
            await asyncio.sleep(0.2)  # gentle rate limiting

    await asyncio.gather(*[fetch_one(aid) for aid in activity_ids])
    return results
