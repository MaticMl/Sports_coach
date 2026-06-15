"""HR drift and aerobic decoupling analysis for Z2 activities."""
import math
import numpy as np
import pandas as pd
from typing import Optional
from .. import cache


RIDE_SPORTS = {"Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide"}
RUN_SPORTS = {"Run", "TrailRun", "VirtualRun", "Treadmill"}


def _segment_size(sport: str, run_seg: int, ride_seg: int) -> int:
    return run_seg if sport in RUN_SPORTS else ride_seg


def _hr_zones_bpm(athlete: dict) -> list[dict]:
    """Extract HR zones from athlete profile. Returns list of {name, min, max} in bpm."""
    zones = []
    # Try athlete-settings format
    settings_zones = (
        athlete.get("zones", {}).get("HR", [])
        or athlete.get("hr_zones", [])
        or athlete.get("heartrate_zones", [])
    )
    max_hr = (
        athlete.get("zone_hr_max")
        or athlete.get("max_hr")
        or athlete.get("maxHR")
        or 190
    )
    rest_hr = (
        athlete.get("zone_hr_rest")
        or athlete.get("restHR")
        or athlete.get("resting_hr")
        or 50
    )

    if settings_zones:
        for i, z in enumerate(settings_zones):
            min_bpm = float(z.get("min") or 0)
            max_bpm = float(z.get("max") or max_hr)
            # Detect fractions (0-1) or percentages (1-100) vs bpm (>100)
            if min_bpm <= 1.5:
                min_bpm = min_bpm * max_hr
            elif min_bpm <= 100:
                min_bpm = min_bpm * max_hr / 100
            if max_bpm <= 1.5:
                max_bpm = max_bpm * max_hr
            elif max_bpm <= 100:
                max_bpm = max_bpm * max_hr / 100
            zones.append({"name": z.get("name", f"Z{i+1}"), "min": int(min_bpm), "max": int(max_bpm)})
    else:
        # Default 5-zone model
        pcts = [(0, 0.60), (0.60, 0.70), (0.70, 0.80), (0.80, 0.90), (0.90, 1.10)]
        for i, (lo, hi) in enumerate(pcts, 1):
            zones.append({"name": f"Z{i}", "min": int(lo * max_hr), "max": int(hi * max_hr)})
    return zones


def _zone_for_hr(hr: float, zones: list[dict]) -> int:
    for i, z in enumerate(zones, 1):
        if z["min"] <= hr < z["max"]:
            return i
    return len(zones) if hr >= zones[-1]["min"] else 1


def _is_z2(avg_hr: float, zones: list[dict]) -> bool:
    if len(zones) < 2:
        return False
    z2 = zones[1]
    return z2["min"] <= avg_hr <= z2["max"]


def _is_z2_activity(avg_hr: float, zones: list[dict]) -> bool:
    """Looser check for activity-level Z2 classification (±5 bpm tolerance)."""
    if len(zones) < 2:
        return False
    z2 = zones[1]
    return (z2["min"] - 5) <= avg_hr <= (z2["max"] + 5)


def _build_df(stream: dict) -> Optional[pd.DataFrame]:
    times = stream.get("time")
    hrs = stream.get("heartrate")
    if not times or not hrs or len(times) != len(hrs):
        return None
    # Try both velocity field names intervals.icu may use
    vel_raw = stream.get("velocity_smooth") or stream.get("speed")
    df = pd.DataFrame({
        "time": pd.to_numeric(times, errors="coerce"),
        "hr": pd.to_numeric(hrs, errors="coerce"),
        "vel": pd.to_numeric(vel_raw, errors="coerce") if vel_raw else pd.Series([float("nan")] * len(times)),
    })
    df = df.dropna(subset=["hr", "time"]).copy()
    if len(df) < 10:
        return None
    return df


def _safe_vel(v) -> Optional[float]:
    """Return float or None — never returns NaN (JSON-unsafe)."""
    if v is None:
        return None
    try:
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _analyze_single(activity: dict, stream: dict, zones: list[dict], run_seg: int, ride_seg: int) -> Optional[dict]:
    sport = activity.get("type", "")
    avg_hr = activity.get("average_heartrate") or activity.get("averageHeartrate") or 0
    if not avg_hr or not _is_z2_activity(avg_hr, zones):
        return None

    df = _build_df(stream)
    if df is None:
        return None

    seg_size = _segment_size(sport, run_seg, ride_seg)
    df["segment"] = (df["time"] // seg_size).astype(int)
    segs = df.groupby("segment").agg(hr_mean=("hr", "mean"), vel_mean=("vel", "mean")).reset_index()
    if len(segs) < 4:
        return None

    # HR drift: avg of last 20% vs first 20%
    n20 = max(1, len(segs) // 5)
    first_hr = segs["hr_mean"].iloc[:n20].mean()
    last_hr = segs["hr_mean"].iloc[-n20:].mean()
    drift_pct = ((last_hr - first_hr) / first_hr) * 100 if first_hr > 0 else 0

    # Aerobic decoupling (EF = HR/velocity ratio)
    mid = len(segs) // 2
    half1 = segs.iloc[:mid]
    half2 = segs.iloc[mid:]
    valid_vel = half1["vel_mean"].notna() & (half1["vel_mean"] > 0)
    valid_vel2 = half2["vel_mean"].notna() & (half2["vel_mean"] > 0)
    if valid_vel.sum() > 3 and valid_vel2.sum() > 3:
        ef1 = (half1.loc[valid_vel, "hr_mean"] / half1.loc[valid_vel, "vel_mean"]).mean()
        ef2 = (half2.loc[valid_vel2, "hr_mean"] / half2.loc[valid_vel2, "vel_mean"]).mean()
        decoupling_pct = ((ef2 - ef1) / ef1) * 100 if ef1 > 0 else 0
    else:
        decoupling_pct = 0

    duration_min = (df["time"].iloc[-1] - df["time"].iloc[0]) / 60
    z2_fraction = df["hr"].apply(lambda h: 1 if _is_z2(h, zones) else 0).mean()

    seg_records = segs[["segment", "hr_mean", "vel_mean"]].to_dict("records")

    return {
        "id": activity.get("id"),
        "date": activity.get("start_date_local", "")[:10],
        "sport": "Run" if sport in RUN_SPORTS else "Ride",
        "name": activity.get("name", "Activity"),
        "duration_min": round(duration_min, 1),
        "avg_hr": round(avg_hr, 1),
        "z2_fraction": round(z2_fraction, 3),
        "hr_drift_pct": round(drift_pct, 2),
        "decoupling_pct": round(decoupling_pct, 2),
        "segments": [
            {
                "seg": int(s["segment"]),
                "hr": round(float(s["hr_mean"]), 1),
                "vel": _safe_vel(s["vel_mean"]),
            }
            for s in seg_records
        ],
    }


def compute(run_seg: int = 60, ride_seg: int = 180, start: str = None, end: str = None) -> dict:
    athlete = cache.load_athlete() or {}
    zones = _hr_zones_bpm(athlete)
    activities = cache.load_activities()
    sport_acts = [a for a in activities if a.get("type") in RUN_SPORTS | RIDE_SPORTS]
    if start:
        sport_acts = [a for a in sport_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        sport_acts = [a for a in sport_acts if (a.get("start_date_local") or "")[:10] <= end]

    results = []
    for act in sport_acts:
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue
        res = _analyze_single(act, stream, zones, run_seg, ride_seg)
        if res:
            results.append(res)

    results.sort(key=lambda x: x["date"])

    trend = [
        {"date": r["date"], "drift_pct": r["hr_drift_pct"], "sport": r["sport"]}
        for r in results
    ]

    return {
        "zones": zones,
        "activities": results[-50:],  # last 50 Z2 sessions
        "trend": trend,
    }
