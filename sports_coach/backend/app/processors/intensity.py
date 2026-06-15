"""Intensity distribution — time in each HR zone per week."""
import pandas as pd
from datetime import datetime, timedelta
from .. import cache
from .hr_drift import _hr_zones_bpm, _zone_for_hr, RIDE_SPORTS, RUN_SPORTS


def _week_start(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def compute(start: str = None, end: str = None) -> dict:
    athlete = cache.load_athlete() or {}
    zones = _hr_zones_bpm(athlete)
    activities = cache.load_activities()
    sport_acts = [a for a in activities if a.get("type") in RUN_SPORTS | RIDE_SPORTS]
    if start:
        sport_acts = [a for a in sport_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        sport_acts = [a for a in sport_acts if (a.get("start_date_local") or "")[:10] <= end]

    weekly: dict[str, dict] = {}
    zone_names = [z["name"] for z in zones]

    for act in sport_acts:
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue
        times = stream.get("time", [])
        hrs = stream.get("heartrate", [])
        if not times or not hrs:
            continue

        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue
        week = _week_start(date_str)
        sport = "Run" if act.get("type") in RUN_SPORTS else "Ride"

        if week not in weekly:
            weekly[week] = {
                "week": week,
                **{f"z{i+1}_min": 0.0 for i in range(len(zones))},
                "run_min": 0.0,
                "ride_min": 0.0,
            }

        # Compute time per zone using trapezoidal approximation
        for i in range(1, len(times)):
            dt = (times[i] - times[i - 1]) / 60  # minutes
            if dt <= 0 or dt > 5:  # skip gaps > 5 min
                continue
            hr_val = hrs[i]
            if hr_val is None:
                continue
            z = _zone_for_hr(float(hr_val), zones)
            weekly[week][f"z{z}_min"] = weekly[week].get(f"z{z}_min", 0) + dt

        total_min = sum(t / 60 for t in [times[-1] - times[0]] if t > 0) if len(times) > 1 else 0
        if sport == "Run":
            weekly[week]["run_min"] += total_min
        else:
            weekly[week]["ride_min"] += total_min

    rows = sorted(weekly.values(), key=lambda x: x["week"])

    # Overall distribution
    totals = {f"z{i+1}": 0.0 for i in range(len(zones))}
    for row in rows:
        for i in range(len(zones)):
            totals[f"z{i+1}"] += row.get(f"z{i+1}_min", 0)
    grand_total = sum(totals.values()) or 1
    overall = [{"zone": zone_names[i], "pct": round(totals[f"z{i+1}"] / grand_total * 100, 1)} for i in range(len(zones))]

    return {"weekly": rows, "overall": overall, "zone_names": zone_names}
