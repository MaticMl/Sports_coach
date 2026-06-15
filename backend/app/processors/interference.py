"""Cycling/run interference, HRV/sleep load correlation, TSS balance."""
import math
from datetime import datetime, timedelta
from collections import defaultdict
from .. import cache
from .hr_drift import RIDE_SPORTS, RUN_SPORTS


def _trimp(duration_min: float, avg_hr: float, max_hr: int, rest_hr: int) -> float:
    """Banister TRIMP — HR-based training load proxy."""
    if max_hr <= rest_hr or avg_hr <= rest_hr:
        return 0
    hr_ratio = (avg_hr - rest_hr) / (max_hr - rest_hr)
    hr_ratio = max(0.0, min(1.0, hr_ratio))
    return duration_min * hr_ratio * (0.64 * math.exp(1.92 * hr_ratio))


def _week_start(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    return (d - timedelta(days=d.weekday())).strftime("%Y-%m-%d")


def compute(start: str = None, end: str = None) -> dict:
    athlete = cache.load_athlete() or {}
    max_hr = athlete.get("max_hr") or athlete.get("maxHR") or 190
    rest_hr = athlete.get("restHR") or athlete.get("resting_hr") or 50

    activities = cache.load_activities()
    wellness = cache.load_wellness()

    if start:
        activities = [a for a in activities if (a.get("start_date_local") or "")[:10] >= start]
        wellness = [w for w in wellness if (w.get("id") or "")[:10] >= start]
    if end:
        activities = [a for a in activities if (a.get("start_date_local") or "")[:10] <= end]
        wellness = [w for w in wellness if (w.get("id") or "")[:10] <= end]

    wellness_by_date: dict[str, dict] = {w.get("id", "")[:10]: w for w in wellness}

    # ── Build daily load ───────────────────────────────────────────────────
    daily_load: dict[str, dict] = {}  # date → {ride_load, run_load, ride_hard}
    for act in activities:
        sport = act.get("type", "")
        date_str = act.get("start_date_local", "")[:10]
        if not date_str or sport not in (RUN_SPORTS | RIDE_SPORTS):
            continue

        avg_hr = act.get("average_heartrate") or 0
        dur_min = (act.get("moving_time") or 0) / 60
        load = (
            act.get("icu_training_load")
            or act.get("icu_hrss")
            or (_trimp(dur_min, avg_hr, max_hr, rest_hr) if avg_hr > 0 else 0)
        )

        if date_str not in daily_load:
            daily_load[date_str] = {"ride_load": 0, "run_load": 0, "ride_hard": False}
        if sport in RIDE_SPORTS:
            daily_load[date_str]["ride_load"] += load
            if load > 80:
                daily_load[date_str]["ride_hard"] = True
        else:
            daily_load[date_str]["run_load"] += load

    # ── Hard cycling → run impact ──────────────────────────────────────────
    hard_cycle_run_impact = []
    sorted_dates = sorted(daily_load.keys())
    for i, date_str in enumerate(sorted_dates):
        if not daily_load[date_str]["ride_hard"]:
            continue
        cycle_load = daily_load[date_str]["ride_load"]
        # Look at runs in the next 3 days
        for delta in [1, 2, 3]:
            next_d = (datetime.fromisoformat(date_str) + timedelta(days=delta)).strftime("%Y-%m-%d")
            if next_d in daily_load and daily_load[next_d]["run_load"] > 0:
                # Compute run efficiency: find the run activity
                for act in activities:
                    if act.get("start_date_local", "")[:10] == next_d and act.get("type") in RUN_SPORTS:
                        # Compare pace to baseline (average Z2 pace in last 30 days)
                        avg_hr = act.get("average_heartrate") or 0
                        avg_speed = act.get("average_speed") or 0
                        if avg_hr > 0 and avg_speed > 0:
                            pace = 1000 / avg_speed / 60
                            hard_cycle_run_impact.append({
                                "cycle_date": date_str,
                                "cycle_load": round(cycle_load, 1),
                                "run_date": next_d,
                                "days_after": delta,
                                "run_pace_min_km": round(pace, 2),
                                "run_avg_hr": round(avg_hr, 1),
                            })

    # ── HRV / load correlation (rolling 7-day load vs daily HRV) ─────────
    hrv_load_correlation = []
    all_dates = sorted(set(list(daily_load.keys()) + list(wellness_by_date.keys())))
    for date_str in all_dates:
        hrv = wellness_by_date.get(date_str, {}).get("hrv") or wellness_by_date.get(date_str, {}).get("hrvSdnn")
        if hrv is None:
            continue
        # Rolling 7-day total load ending the day before
        d = datetime.fromisoformat(date_str)
        load_sum = 0
        for delta in range(1, 8):
            past = (d - timedelta(days=delta)).strftime("%Y-%m-%d")
            load_sum += daily_load.get(past, {}).get("ride_load", 0) + daily_load.get(past, {}).get("run_load", 0)
        hrv_load_correlation.append({
            "date": date_str,
            "hrv": round(float(hrv), 1),
            "rolling_7d_load": round(load_sum, 1),
        })

    # ── Sleep / load correlation ───────────────────────────────────────────
    sleep_load_correlation = []
    for date_str in all_dates:
        w = wellness_by_date.get(date_str, {})
        sleep_score = w.get("sleepScore") or w.get("sleep_score")
        sleep_secs = w.get("sleepSeconds") or w.get("sleep_seconds")
        if sleep_score is None and sleep_secs is None:
            continue
        sleep_hours = round(float(sleep_secs) / 3600, 2) if sleep_secs else None
        d = datetime.fromisoformat(date_str)
        load_sum = 0
        for delta in range(1, 8):
            past = (d - timedelta(days=delta)).strftime("%Y-%m-%d")
            load_sum += daily_load.get(past, {}).get("ride_load", 0) + daily_load.get(past, {}).get("run_load", 0)
        sleep_load_correlation.append({
            "date": date_str,
            "sleep_score": sleep_score,
            "sleep_hours": sleep_hours,
            "rolling_7d_load": round(load_sum, 1),
        })

    # ── Weekly load balance ────────────────────────────────────────────────
    weekly: dict[str, dict] = {}
    for date_str, loads in daily_load.items():
        week = _week_start(date_str)
        if week not in weekly:
            weekly[week] = {"week": week, "run_load": 0, "ride_load": 0}
        weekly[week]["run_load"] += loads["run_load"]
        weekly[week]["ride_load"] += loads["ride_load"]

    weekly_balance = sorted(
        [{"week": k, "run_load": round(v["run_load"], 1), "ride_load": round(v["ride_load"], 1)} for k, v in weekly.items()],
        key=lambda x: x["week"],
    )

    return {
        "hard_cycle_run_impact": hard_cycle_run_impact[-30:],
        "hrv_load_correlation": hrv_load_correlation[-180:],
        "sleep_load_correlation": sleep_load_correlation[-180:],
        "weekly_load_balance": weekly_balance,
    }
