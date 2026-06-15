"""VAM / HR / estimated power analysis for cycling climbs.

Power model: Martin et al. (1998) "Validation of a Mathematical Model for Road
Cycling Power", Journal of Applied Biomechanics 14(3):276-291.

  P = [(m·g·(sin θ + Crr·cos θ)) + (½·ρ·CdA·v²)] · v / (1 − loss_dt)

where v is inferred from VAM and climb gradient, and θ = arctan(grade/100).
"""
import math
from datetime import datetime
import pandas as pd
from .. import cache
from ..config import settings
from .hr_drift import RIDE_SPORTS

MIN_CLIMB_GAIN_M = 20
MIN_CLIMB_DURATION_S = 90
MERGE_GAP_S = 90
FORWARD_WINDOW_S = 60
FORWARD_GAIN_THRESHOLD_M = 3.0
SMOOTH_WINDOW = 15

# Martin et al. 1998 constants
_G = 9.8067        # m/s²
_RHO = 1.2         # air density kg/m³ (sea level, ~15 °C)
_CDA = 0.32        # m² — typical climbing (hoods, back ~10 % above horizontal)
_CRR = 0.004       # rolling resistance (road clincher)
_LOSS = 0.02       # drivetrain loss fraction


def _smooth_altitude(altitudes: list) -> list:
    s = pd.Series([float(a) if a is not None else float("nan") for a in altitudes])
    return s.rolling(window=SMOOTH_WINDOW, center=True, min_periods=1).mean().tolist()


def estimate_power(vam_m_hr: float, alt_gain_m: float, distance_m: float,
                   rider_mass_kg: float) -> tuple:
    """Return (power_w, power_wkg) using Martin et al. 1998 model, or (None, None)."""
    if not vam_m_hr or distance_m <= 0 or alt_gain_m <= 0:
        return None, None
    total_mass = rider_mass_kg + settings.bike_mass_kg
    gradient_pct = (alt_gain_m / distance_m) * 100.0
    if gradient_pct <= 0.5:          # < 0.5 % is flat — formula breaks down
        return None, None
    theta = math.atan(gradient_pct / 100.0)
    sin_t = math.sin(theta)
    cos_t = math.cos(theta)
    v = (vam_m_hr / 3600.0) / sin_t  # m/s ground speed
    f_gravity = total_mass * _G * sin_t
    f_rolling = total_mass * _G * _CRR * cos_t
    f_aero = 0.5 * _RHO * _CDA * v ** 2
    power_w = (f_gravity + f_rolling + f_aero) * v / (1.0 - _LOSS)
    return round(power_w, 0), round(power_w / rider_mass_kg, 2)


def _detect_climbs(times: list, altitudes: list, hrs: list,
                   distances: list = None, vels: list = None) -> list:
    """Detect climbing segments; return list of dicts with per-climb stats."""
    if not times or not altitudes or len(altitudes) < 30:
        return []

    n = min(len(times), len(altitudes))
    t = times[:n]
    alt_smooth = _smooth_altitude(altitudes[:n])
    hr_arr = hrs[:n] if hrs else []
    dist_arr = distances[:n] if distances else []
    vel_arr = vels[:n] if vels else []

    # Mark each point as "climbing" if forward gain over next FORWARD_WINDOW_S exceeds threshold
    ascending = []
    for i in range(n):
        t_target = t[i] + FORWARD_WINDOW_S
        j = i
        while j < n - 1 and t[j] < t_target:
            j += 1
        a_i, a_j = alt_smooth[i], alt_smooth[j]
        nan = float("nan")
        if a_i is None or a_j is None or a_i != a_i or a_j != a_j:
            ascending.append(False)
        else:
            ascending.append((a_j - a_i) >= FORWARD_GAIN_THRESHOLD_M)

    # Collect contiguous ascending blocks
    blocks = []
    start = None
    for i in range(n):
        if ascending[i] and start is None:
            start = i
        elif not ascending[i] and start is not None:
            blocks.append([start, i - 1])
            start = None
    if start is not None:
        blocks.append([start, n - 1])
    if not blocks:
        return []

    # Merge blocks whose gap is under MERGE_GAP_S
    merged = [blocks[0][:]]
    for b in blocks[1:]:
        gap = t[b[0]] - t[merged[-1][1]]
        if gap <= MERGE_GAP_S:
            merged[-1][1] = b[1]
        else:
            merged.append(b[:])

    results = []
    for s_i, e_i in merged:
        duration_s = t[e_i] - t[s_i]
        if duration_s < MIN_CLIMB_DURATION_S:
            continue

        block_alts = [alt_smooth[k] for k in range(s_i, e_i + 1)
                      if alt_smooth[k] is not None and alt_smooth[k] == alt_smooth[k]]
        if not block_alts:
            continue
        alt_gain = max(block_alts) - block_alts[0]
        if alt_gain < MIN_CLIMB_GAIN_M:
            continue

        hr_vals = [float(hr_arr[k]) for k in range(s_i, e_i + 1)
                   if k < len(hr_arr) and hr_arr[k] is not None]

        # Distance: prefer cumulative distance stream, fall back to integrating velocity
        dist_m = 0.0
        if dist_arr and e_i < len(dist_arr) and dist_arr[s_i] is not None and dist_arr[e_i] is not None:
            dist_m = float(dist_arr[e_i]) - float(dist_arr[s_i])
        elif vel_arr:
            for k in range(s_i, min(e_i, len(vel_arr) - 1)):
                if k < len(t) and vel_arr[k] is not None:
                    dt = t[k + 1] - t[k]
                    dist_m += max(0.0, float(vel_arr[k])) * dt

        results.append({
            "duration_s": duration_s,
            "alt_gain_m": round(alt_gain, 1),
            "distance_m": round(dist_m, 0),
            "avg_hr": round(sum(hr_vals) / len(hr_vals), 1) if hr_vals else None,
        })

    return results


def _quarter(date_str: str) -> str:
    d = datetime.fromisoformat(date_str[:10])
    q = (d.month - 1) // 3 + 1
    return f"{d.year}-Q{q}"


DEFAULT_RIDER_MASS_KG = 105.0  # used when no weight entry precedes the activity


def _build_weight_history(wellness: list) -> list[tuple[str, float]]:
    """Sorted (date_str, weight_kg) pairs from wellness entries that have weight."""
    history = [
        (w["id"], float(w["weight"]))
        for w in wellness
        if w.get("id") and w.get("weight")
    ]
    history.sort(key=lambda x: x[0])
    return history


def _weight_at(history: list[tuple[str, float]], date_str: str) -> float:
    """Last reported weight on or before date_str; DEFAULT_RIDER_MASS_KG if none."""
    result = DEFAULT_RIDER_MASS_KG
    for d, w in history:
        if d <= date_str:
            result = w
        else:
            break
    return result


def compute(start: str = None, end: str = None) -> dict:
    wellness = cache.load_wellness()
    weight_history = _build_weight_history(wellness)

    activities = cache.load_activities()
    ride_acts = [a for a in activities if a.get("type") in RIDE_SPORTS]
    if start:
        ride_acts = [a for a in ride_acts if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        ride_acts = [a for a in ride_acts if (a.get("start_date_local") or "")[:10] <= end]

    all_climbs = []

    for act in ride_acts:
        date_str = act.get("start_date_local", "")[:10]
        if not date_str:
            continue
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue

        times = stream.get("time", [])
        altitudes = stream.get("altitude", [])
        hrs = stream.get("heartrate", [])
        distances = stream.get("distance", [])
        vels = stream.get("velocity_smooth") or stream.get("speed") or []

        if not altitudes or len(altitudes) < 30:
            continue

        climbs = _detect_climbs(times, altitudes, hrs, distances=distances, vels=vels)
        for c in climbs:
            if c["avg_hr"] is None:
                continue
            duration_min = c["duration_s"] / 60
            vam = (c["alt_gain_m"] / c["duration_s"]) * 3600
            if vam < 200:
                continue
            rider_mass_kg = _weight_at(weight_history, date_str)
            power_w, power_wkg = estimate_power(vam, c["alt_gain_m"], c["distance_m"], rider_mass_kg)
            gradient_pct = round((c["alt_gain_m"] / c["distance_m"]) * 100, 1) if c["distance_m"] > 0 else None
            all_climbs.append({
                "activity_id": str(act.get("id")),
                "date": date_str,
                "activity_name": act.get("name", "Ride"),
                "duration_min": round(duration_min, 1),
                "elevation_gain_m": c["alt_gain_m"],
                "distance_m": c["distance_m"],
                "gradient_pct": gradient_pct,
                "vam": round(vam, 0),
                "avg_hr": c["avg_hr"],
                "rider_mass_kg": rider_mass_kg,
                "est_power_w": power_w,
                "est_power_wkg": power_wkg,
            })

    all_climbs.sort(key=lambda x: x["date"])

    vam_hr_scatter = [
        {
            "vam": c["vam"],
            "hr": c["avg_hr"],
            "date": c["date"],
            "duration_min": c["duration_min"],
            "activity_id": c["activity_id"],
            "est_power_w": c["est_power_w"],
            "est_power_wkg": c["est_power_wkg"],
            "gradient_pct": c["gradient_pct"],
            "rider_mass_kg": c["rider_mass_kg"],
        }
        for c in all_climbs
    ]

    # Quarterly trend — include mean estimated power where available
    qdata: dict[str, list] = {}
    for c in all_climbs:
        q = _quarter(c["date"])
        qdata.setdefault(q, []).append(c)

    vam_trend = []
    for q, items in sorted(qdata.items()):
        avg_vam = sum(i["vam"] for i in items) / len(items)
        avg_hr = sum(i["avg_hr"] for i in items) / len(items)
        power_items = [i["est_power_wkg"] for i in items if i["est_power_wkg"] is not None]
        avg_power_wkg = round(sum(power_items) / len(power_items), 2) if power_items else None
        vam_trend.append({
            "quarter": q,
            "avg_vam": round(avg_vam, 0),
            "avg_hr": round(avg_hr, 1),
            "avg_power_wkg": avg_power_wkg,
            "count": len(items),
        })

    # Most recent known weight for display in the UI footnote
    current_mass = weight_history[-1][1] if weight_history else DEFAULT_RIDER_MASS_KG

    return {
        "climbs": all_climbs[-100:],
        "vam_hr_scatter": vam_hr_scatter[-500:],
        "vam_trend": vam_trend,
        "rider_mass_kg": current_mass,
    }
