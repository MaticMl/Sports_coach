"""Daily AI-agent report generator: outputs .md + .json."""
import json
from datetime import date, datetime, timedelta
from pathlib import Path
from . import cache
from .config import settings
from .processors import hr_drift, intensity, run_progression, interference, climb_vam, pace_hr


def _trend_arrow(values: list[float]) -> str:
    if len(values) < 2:
        return "→"
    delta = values[-1] - values[-3] if len(values) >= 3 else values[-1] - values[0]
    if delta > 1:
        return "↑"
    if delta < -1:
        return "↓"
    return "→"


def generate() -> tuple[Path, Path]:
    today = date.today().isoformat()
    athlete = cache.load_athlete() or {}
    wellness = cache.load_wellness()
    activities = cache.load_activities()

    # Recent wellness (last 14 days)
    cutoff = (datetime.today() - timedelta(days=14)).strftime("%Y-%m-%d")
    recent_wellness = [w for w in wellness if w.get("id", "")[:10] >= cutoff]
    hrv_vals = [float(w["hrv"]) for w in recent_wellness if w.get("hrv") is not None]
    sleep_scores = [float(w.get("sleepScore") or w.get("sleep_score", 0)) for w in recent_wellness if w.get("sleepScore") or w.get("sleep_score")]
    weights = [float(w["weight"]) for w in recent_wellness if w.get("weight") is not None]

    # Recent activities (last 14 days)
    recent_acts = [a for a in activities if a.get("start_date_local", "")[:10] >= cutoff]
    recent_acts.sort(key=lambda x: x.get("start_date_local", ""), reverse=True)

    # Compute all analytics
    hrd = hr_drift.compute(settings.run_segment_seconds, settings.ride_segment_seconds)
    inten = intensity.compute()
    rp = run_progression.compute()
    interf = interference.compute()
    vam = climb_vam.compute()
    phr = pace_hr.compute()

    # ── Build JSON payload ─────────────────────────────────────────────────
    json_data = {
        "report_date": today,
        "athlete": {"name": athlete.get("name", "Athlete"), "id": settings.athlete_id},
        "wellness_14d": {
            "hrv_values": hrv_vals,
            "hrv_trend": _trend_arrow(hrv_vals) if hrv_vals else "N/A",
            "sleep_scores": sleep_scores,
            "sleep_trend": _trend_arrow(sleep_scores) if sleep_scores else "N/A",
            "weights": weights,
        },
        "recent_activities": [
            {
                "date": a.get("start_date_local", "")[:10],
                "name": a.get("name"),
                "type": a.get("type"),
                "distance_km": round((a.get("distance") or 0) / 1000, 2),
                "duration_min": round((a.get("moving_time") or 0) / 60, 1),
                "avg_hr": a.get("average_heartrate"),
                "load": a.get("icu_training_load") or a.get("icu_hrss"),
            }
            for a in recent_acts[:10]
        ],
        "hr_drift": {
            "last_5_z2_sessions": hrd["activities"][-5:] if hrd["activities"] else [],
            "trend": hrd["trend"][-30:],
        },
        "intensity_distribution": {
            "overall_pct": inten["overall"],
            "last_4_weeks": inten["weekly"][-4:],
        },
        "run_progression": {
            "weekly_volume_last_12w": rp["weekly_volume"][-12:],
            "z2_pace_trend_last_20": rp["z2_pace_trend"][-20:],
            "hr_at_pace_by_quarter": rp["hr_at_pace_trend"],
        },
        "interference": {
            "hard_cycle_run_impact": interf["hard_cycle_run_impact"][-10:],
            "weekly_load_balance_last_12w": interf["weekly_load_balance"][-12:],
            "hrv_load_correlation_last_60d": interf["hrv_load_correlation"][-60:],
        },
        "climb_vam": {
            "recent_climbs": vam["climbs"][-10:],
            "trend_by_quarter": vam["vam_trend"],
        },
        "pace_hr_efficiency": {
            "regression_by_period": phr["regression_by_period"],
            "efficiency_trend": phr["efficiency_trend"][-12:],
        },
    }

    # ── Build Markdown narrative ───────────────────────────────────────────
    name = athlete.get("name", "Athlete")
    lines = [
        f"# Sports Coach Daily Report — {today}",
        f"**Athlete:** {name}",
        "",
        "---",
        "",
        "## Wellness (Last 14 Days)",
    ]

    if hrv_vals:
        avg_hrv = round(sum(hrv_vals) / len(hrv_vals), 1)
        trend = _trend_arrow(hrv_vals)
        lines.append(f"- **HRV:** avg {avg_hrv} ms | trend {trend} | latest: {hrv_vals[-1]} ms")
    else:
        lines.append("- HRV data not available")

    if sleep_scores:
        avg_sleep = round(sum(sleep_scores) / len(sleep_scores), 1)
        lines.append(f"- **Sleep Score:** avg {avg_sleep} | trend {_trend_arrow(sleep_scores)}")
    if weights:
        lines.append(f"- **Weight:** latest {weights[-1]} kg")

    lines += ["", "## Recent Activities (Last 14 Days)", ""]
    for a in recent_acts[:7]:
        dist = round((a.get("distance") or 0) / 1000, 1)
        dur = round((a.get("moving_time") or 0) / 60, 0)
        hr = a.get("average_heartrate", "—")
        load = round(a.get("icu_training_load") or a.get("icu_hrss") or 0, 0)
        lines.append(f"- **{a.get('start_date_local','')[:10]}** {a.get('type')} — {a.get('name')} | {dist}km {dur}min HR:{hr} Load:{load}")

    lines += ["", "## HR Drift Analysis (Z2 Sessions)", ""]
    if hrd["activities"]:
        lines.append("| Date | Sport | Duration | Avg HR | Z2% | Drift% | Decoupling% |")
        lines.append("|------|-------|----------|--------|-----|--------|-------------|")
        for s in hrd["activities"][-8:]:
            status = "✅" if abs(s["decoupling_pct"]) < 5 else "⚠️"
            lines.append(f"| {s['date']} | {s['sport']} | {s['duration_min']}min | {s['avg_hr']} | {round(s['z2_fraction']*100,0)}% | {s['hr_drift_pct']:+.1f}% | {s['decoupling_pct']:+.1f}% {status} |")
    else:
        lines.append("No Z2 activities with stream data found yet.")

    lines += ["", "## Intensity Distribution (Last 4 Weeks)", ""]
    if inten["overall"]:
        for z in inten["overall"]:
            bar = "█" * int(z["pct"] / 5)
            lines.append(f"- {z['zone']}: {z['pct']}% {bar}")

    lines += ["", "## Run Progression", ""]
    if rp["z2_pace_trend"]:
        first = rp["z2_pace_trend"][0]
        last = rp["z2_pace_trend"][-1]
        lines.append(f"- **Z2 Pace:** {first['date']} → {last['date']}: {first['pace_min_per_km']} min/km → {last['pace_min_per_km']} min/km")
    else:
        lines.append("- Not enough Z2 run data yet.")

    if rp["weekly_volume"]:
        last4w = rp["weekly_volume"][-4:]
        avg_vol = round(sum(w["distance_km"] for w in last4w) / len(last4w), 1)
        lines.append(f"- **Avg weekly volume (last 4w):** {avg_vol} km")

    lines += ["", "## Cycling/Run Interference", ""]
    if interf["hard_cycle_run_impact"]:
        lines.append(f"- **Hard cycling → run impacts detected:** {len(interf['hard_cycle_run_impact'])} instances")
        last = interf["hard_cycle_run_impact"][-1]
        lines.append(f"  - Most recent: {last['cycle_date']} hard ride (load {last['cycle_load']}) → run on {last['run_date']} ({last['days_after']}d later, pace {last['run_pace_min_km']} min/km, HR {last['run_avg_hr']})")
    else:
        lines.append("- No hard cycling → run impact instances detected.")

    lines += ["", "## Climb Performance (VAM)", ""]
    if vam["vam_trend"]:
        latest_q = vam["vam_trend"][-1]
        lines.append(f"- **Latest quarter ({latest_q['quarter']}):** avg VAM {latest_q['avg_vam']} m/hr at avg HR {latest_q['avg_hr']} ({latest_q['count']} climbs)")
        if len(vam["vam_trend"]) >= 2:
            prev_q = vam["vam_trend"][-2]
            delta = latest_q["avg_vam"] - prev_q["avg_vam"]
            lines.append(f"- **vs previous quarter:** VAM {delta:+.0f} m/hr")
    else:
        lines.append("- No climb data available.")

    lines += ["", "## Running Aerobic Efficiency (Pace/HR)", ""]
    if phr["regression_by_period"]:
        last_reg = phr["regression_by_period"][-1]
        lines.append(f"- **Latest period ({last_reg['period']}):** slope {last_reg['slope']} HR/(min/km), R²={last_reg['r2']}")
    if phr["efficiency_trend"] and len(phr["efficiency_trend"]) >= 2:
        first_e = phr["efficiency_trend"][0]
        last_e = phr["efficiency_trend"][-1]
        delta = round(last_e["hr_per_pace_unit"] - first_e["hr_per_pace_unit"], 2)
        lines.append(f"- **Efficiency change ({first_e['month']} → {last_e['month']}):** {delta:+.2f} HR/pace-unit ({'improved' if delta < 0 else 'declined'})")

    lines += ["", "---", "", "_Generated by Sports Coach. Feed this file to an AI agent for analysis._"]

    markdown = "\n".join(lines)

    # ── Write files ───────────────────────────────────────────────────────
    md_path = settings.output_dir / f"report_{today}.md"
    json_path = settings.output_dir / f"report_{today}.json"
    md_path.write_text(markdown, encoding="utf-8")
    json_path.write_text(json.dumps(json_data, ensure_ascii=False, indent=2), encoding="utf-8")

    return md_path, json_path
