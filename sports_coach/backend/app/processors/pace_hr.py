"""Pace/HR aerobic efficiency for running — 1-min segment scatter + regression."""
import math
from datetime import datetime
from collections import defaultdict
from .. import cache
from .hr_drift import RUN_SPORTS

SEG_SECONDS = 60
WARMUP_SEGS = 5        # skip first 5 minutes of every activity
HR_STD_MAX = 5.0       # bpm — reject segments where HR is still drifting/spiking
VEL_CV_MAX = 0.08      # reject segments where pace varies by more than 8%


def _quarter(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


def _linear_regression(xs, ys):
    n = len(xs)
    if n < 2:
        return None, None, 0
    mx = sum(xs) / n
    my = sum(ys) / n
    ss_xy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    ss_xx = sum((x - mx) ** 2 for x in xs)
    if ss_xx == 0:
        return None, None, 0
    slope = ss_xy / ss_xx
    intercept = my - slope * mx
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0
    return slope, intercept, r2


def compute(start: str = None, end: str = None) -> dict:
    activities = cache.load_activities()
    run_acts = [a for a in activities if a.get("type") in RUN_SPORTS]
    if start:
        run_acts = [a for a in run_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        run_acts = [a for a in run_acts if (a.get("start_date_local") or "")[:10] <= end]

    segments_by_period: dict[str, list] = defaultdict(list)
    all_segments = []

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
        n = min(len(times), len(hrs), len(vels))

        # Determine which segment index corresponds to the start of the activity
        first_seg = times[0] // SEG_SECONDS if times else 0

        # Build 1-min segments
        seg_data: dict[int, list] = defaultdict(list)
        for i in range(n):
            if hrs[i] is None or vels[i] is None:
                continue
            hr_v = float(hrs[i])
            vel_v = float(vels[i])
            if vel_v <= 0 or hr_v < 60:
                continue
            seg = times[i] // SEG_SECONDS
            seg_data[seg].append((hr_v, vel_v))

        for seg_num, pts in seg_data.items():
            # Skip warmup — first WARMUP_SEGS minutes of the activity
            if seg_num - first_seg < WARMUP_SEGS:
                continue
            # Need at least 30 data points (≥30 Hz·s coverage in a 60-s window)
            if len(pts) < 30:
                continue

            hrs_seg = [h for h, _ in pts]
            vels_seg = [v for _, v in pts]
            avg_hr = sum(hrs_seg) / len(hrs_seg)
            avg_vel = sum(vels_seg) / len(vels_seg)

            # Steady-state HR filter: reject if HR is still drifting or spiking
            hr_mean_sq = sum((h - avg_hr) ** 2 for h in hrs_seg) / len(hrs_seg)
            hr_std = math.sqrt(hr_mean_sq)
            if hr_std > HR_STD_MAX:
                continue

            # Steady-state pace filter: reject if pace is inconsistent (intervals, hills)
            vel_mean_sq = sum((v - avg_vel) ** 2 for v in vels_seg) / len(vels_seg)
            vel_cv = math.sqrt(vel_mean_sq) / avg_vel if avg_vel > 0 else 1
            if vel_cv > VEL_CV_MAX:
                continue

            pace = 1000 / avg_vel / 60  # min/km
            if pace < 3 or pace > 12:
                continue

            seg_obj = {"date": date_str, "activity_id": str(act.get("id", "")), "pace_min_per_km": round(pace, 3), "hr": round(avg_hr, 1), "period": quarter}
            all_segments.append(seg_obj)
            segments_by_period[quarter].append((pace, avg_hr))

    all_segments.sort(key=lambda x: x["date"])

    # Regression per period
    regression_by_period = []
    for period, pts in sorted(segments_by_period.items()):
        if len(pts) < 10:
            continue
        paces, hrs = zip(*pts)
        slope, intercept, r2 = _linear_regression(list(paces), list(hrs))
        if slope is not None:
            regression_by_period.append({
                "period": period,
                "slope": round(slope, 3),
                "intercept": round(intercept, 3),
                "r2": round(r2, 3),
            })

    # Efficiency trend: median HR / pace_unit per month (lower = more efficient)
    monthly: dict[str, list] = defaultdict(list)
    for seg in all_segments:
        month = seg["date"][:7]
        if seg["pace_min_per_km"] > 0:
            monthly[month].append(seg["hr"] / seg["pace_min_per_km"])

    efficiency_trend = []
    for month in sorted(monthly.keys()):
        vals = monthly[month]
        if vals:
            efficiency_trend.append({"month": month, "hr_per_pace_unit": round(sum(vals) / len(vals), 2)})

    return {
        "segments": all_segments[-2000:],  # cap to avoid huge payload
        "regression_by_period": regression_by_period,
        "efficiency_trend": efficiency_trend,
    }
