"""Long-run progression: weekly volume, Z2 pace trend, HR-at-pace trend."""
from datetime import datetime, timedelta
from collections import defaultdict
from .. import cache
from .hr_drift import _hr_zones_bpm, _is_z2_activity, RUN_SPORTS


def _week_start(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    monday = d - timedelta(days=d.weekday())
    return monday.strftime("%Y-%m-%d")


def _quarter(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _ms_to_min_per_km(mps: float) -> float:
    """Convert m/s to min/km."""
    if mps <= 0:
        return 0
    return 1000 / mps / 60


def compute(start: str = None, end: str = None) -> dict:
    athlete = cache.load_athlete() or {}
    zones = _hr_zones_bpm(athlete)
    activities = cache.load_activities()
    run_acts = [a for a in activities if a.get("type") in RUN_SPORTS]
    if start:
        run_acts = [a for a in run_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        run_acts = [a for a in run_acts if (a.get("start_date_local") or "")[:10] <= end]

    # ── Weekly volume ──────────────────────────────────────────────────────
    weekly_vol: dict[str, dict] = {}
    for act in run_acts:
        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue
        week = _week_start(date_str)
        dist_km = (act.get("distance") or 0) / 1000
        dur_min = (act.get("moving_time") or 0) / 60
        if week not in weekly_vol:
            weekly_vol[week] = {"week": week, "distance_km": 0.0, "duration_min": 0.0, "runs": 0}
        weekly_vol[week]["distance_km"] += dist_km
        weekly_vol[week]["duration_min"] += dur_min
        weekly_vol[week]["runs"] += 1

    weekly_volume = sorted(weekly_vol.values(), key=lambda x: x["week"])

    # ── Z2 pace trend (per activity) ──────────────────────────────────────
    z2_pace_trend = []
    for act in run_acts:
        avg_hr = act.get("average_heartrate") or 0
        if not avg_hr or not _is_z2_activity(avg_hr, zones):
            continue
        avg_speed = act.get("average_speed") or act.get("averageSpeed") or 0
        if avg_speed <= 0:
            continue
        pace = _ms_to_min_per_km(avg_speed)
        date_str = act.get("start_date_local", "")[:10]
        if pace > 3 and pace < 15:  # sanity filter: 3–15 min/km
            z2_pace_trend.append({"date": date_str, "pace_min_per_km": round(pace, 2), "hr": round(avg_hr, 1)})

    z2_pace_trend.sort(key=lambda x: x["date"])

    # ── HR at standard pace bins (per 1-min segment) ───────────────────────
    pace_bins = {
        "4:00-4:30": (4.0, 4.5),
        "4:30-5:00": (4.5, 5.0),
        "5:00-5:30": (5.0, 5.5),
        "5:30-6:00": (5.5, 6.0),
        "6:00-6:30": (6.0, 6.5),
        "6:30-7:00": (6.5, 7.0),
    }
    # group: quarter → pace_bin → [hr values]
    qpb: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

    for act in run_acts:
        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue
        times = stream.get("time", [])
        hrs = stream.get("heartrate", [])
        vels = stream.get("velocity_smooth") or stream.get("speed") or []
        if not times or not hrs or not vels:
            continue

        quarter = _quarter(date_str)
        seg_size = 60  # 1-min segments
        n = min(len(times), len(hrs), len(vels))
        segs: dict[int, list] = defaultdict(list)
        for i in range(n):
            seg = times[i] // seg_size
            if hrs[i] is not None and vels[i] is not None and float(vels[i]) > 0:
                segs[seg].append((float(hrs[i]), float(vels[i])))

        for seg_data in segs.values():
            avg_hr = sum(h for h, _ in seg_data) / len(seg_data)
            avg_vel = sum(v for _, v in seg_data) / len(seg_data)
            pace = _ms_to_min_per_km(avg_vel)
            for bin_name, (lo, hi) in pace_bins.items():
                if lo <= pace < hi:
                    qpb[quarter][bin_name].append(avg_hr)

    hr_at_pace = []
    for quarter, bins in sorted(qpb.items()):
        for bin_name, hrs_list in sorted(bins.items()):
            if len(hrs_list) >= 3:
                hr_at_pace.append({
                    "quarter": quarter,
                    "pace_bin": bin_name,
                    "avg_hr": round(sum(hrs_list) / len(hrs_list), 1),
                    "count": len(hrs_list),
                })

    return {
        "weekly_volume": weekly_volume,
        "z2_pace_trend": z2_pace_trend,
        "hr_at_pace_trend": hr_at_pace,
    }
