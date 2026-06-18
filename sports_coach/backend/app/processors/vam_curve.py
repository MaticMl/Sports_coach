"""VAM curve progression: best VAM per fixed duration interval for each ride.

Algorithm follows the user-provided approach:
  1. Skip leading altitude points <= 1 m (GPS artefact at start)
  2. Build monotonic cumulative gain (sum only positive deltas)
  3. Sliding window of exactly `interval` samples → best gain
  4. VAM = best_gain / interval * 3600

Assumes the altitude stream is sampled at 1 Hz (one value per second),
consistent with the reference JavaScript implementation.
"""
import numpy as np
from datetime import datetime, timezone
from .. import cache
from .hr_drift import RIDE_SPORTS

INTERVALS_SEC = [60, 120, 240, 300, 600, 1200, 1800, 2700, 3600, 7200, 10800, 18000]
INTERVAL_LABELS = [
    "1 min", "2 min", "4 min", "5 min", "10 min", "20 min",
    "30 min", "45 min", "1 h", "2 h", "3 h", "5 h",
]
INTERVAL_SHORT = ["1m", "2m", "4m", "5m", "10m", "20m", "30m", "45m", "1h", "2h", "3h", "5h"]


def _best_vam(altitude: list, interval_sec: int) -> float | None:
    """Best VAM (m/h) over any `interval_sec`-second window."""
    alt = np.asarray(altitude, dtype=float)

    # Skip leading GPS artefacts
    start = int(np.argmax(alt > 1))
    if alt[start] <= 1:
        return None
    alt = alt[start:]

    if len(alt) <= interval_sec:
        return None

    gains = np.where(np.diff(alt) > 0, np.diff(alt), 0.0)
    cum = np.concatenate([[0.0], np.cumsum(gains)])

    # All sliding windows in one vectorised subtraction
    window_gains = cum[interval_sec:] - cum[:len(cum) - interval_sec]
    best = float(np.max(window_gains))
    return round((best / interval_sec) * 3600, 1)


def compute(start: str = None, end: str = None) -> dict:
    activities = cache.load_activities()
    rides = [a for a in activities if a.get("type") in RIDE_SPORTS]
    if start:
        rides = [a for a in rides if (a.get("start_date_local") or "")[:10] >= start]
    if end:
        rides = [a for a in rides if (a.get("start_date_local") or "")[:10] <= end]
    rides.sort(key=lambda a: (a.get("start_date_local") or ""))

    results = []
    for act in rides:
        date_str = (act.get("start_date_local") or "")[:10]
        if not date_str:
            continue
        stream = cache.load_stream(str(act.get("id", "")))
        if not stream:
            continue
        altitude = stream.get("altitude")
        if not altitude or len(altitude) < 120:
            continue

        moving_time = act.get("moving_time") or 0

        vam_peaks = []
        for interval in INTERVALS_SEC:
            if interval > moving_time * 1.05:
                vam_peaks.append(None)
            else:
                vam_peaks.append(_best_vam(altitude, interval))

        # Skip flat rides — all peaks None or zero
        if not any(v and v > 50 for v in vam_peaks):
            continue

        try:
            ts = int(datetime.fromisoformat(date_str)
                     .replace(tzinfo=timezone.utc).timestamp() * 1000)
        except ValueError:
            continue

        results.append({
            "date":        date_str,
            "ts":          ts,
            "activity_id": str(act.get("id", "")),
            "name":        act.get("name") or "Ride",
            "vam_peaks":   vam_peaks,
        })

    return {
        "intervals_sec":   INTERVALS_SEC,
        "interval_labels": INTERVAL_LABELS,
        "interval_short":  INTERVAL_SHORT,
        "activities":      results,
    }
