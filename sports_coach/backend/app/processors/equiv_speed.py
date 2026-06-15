"""Cycling Equivalent Speed (ES) per activity.

Formula: ES = Σv² / Σv  (Lee Naish, https://lee-naish.github.io/src/posavespeed/)

ES is the speed-weighted average speed: faster segments contribute more than
slower ones. It equals ∫v² dt / ∫v dt = ∫v² dt / distance, i.e. the area
under a speed-vs-distance curve divided by total distance.
"""
from datetime import datetime
from .. import cache
from .hr_drift import RIDE_SPORTS

ROLLING_WINDOW = 8   # activities for rolling average
MIN_MOVING_S = 120   # discard activities with less than 2 min of moving data


def compute(start: str = None, end: str = None) -> dict:
    activities = cache.load_activities()
    ride_acts = [a for a in activities if a.get("type") in RIDE_SPORTS]
    if start:
        ride_acts = [a for a in ride_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        ride_acts = [a for a in ride_acts if (a.get("start_date_local") or "")[:10] <= end]

    results = []

    for act in ride_acts:
        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue

        vels = stream.get("velocity_smooth") or stream.get("speed") or []
        # Keep only moving seconds (v > 0); convert m/s → km/h
        vels_kmh = [v * 3.6 for v in vels if v is not None and v > 0]

        if len(vels_kmh) < MIN_MOVING_S:
            continue

        sum_v = sum(vels_kmh)
        sum_v2 = sum(v * v for v in vels_kmh)
        es = sum_v2 / sum_v
        avg_speed = sum_v / len(vels_kmh)

        # Unix timestamp (ms) for a proportionally-spaced time axis
        try:
            ts = int(datetime.fromisoformat(date_str).timestamp() * 1000)
        except ValueError:
            continue

        results.append({
            "date": date_str,
            "ts": ts,
            "activity_id": str(act.get("id", "")),
            "activity_name": act.get("name", "Ride"),
            "es_kmh": round(es, 2),
            "avg_speed_kmh": round(avg_speed, 2),
            "distance_km": round(act.get("distance", 0) / 1000, 1) if act.get("distance") else None,
        })

    results.sort(key=lambda x: x["date"])

    # Rolling average (ROLLING_WINDOW-activity window)
    for i, r in enumerate(results):
        window = results[max(0, i - ROLLING_WINDOW + 1):i + 1]
        r["rolling_avg_es"] = round(sum(x["es_kmh"] for x in window) / len(window), 2)

    return {"activities": results}
