#!/usr/bin/env python3
"""One-time migration: import missing Run/Ride activities from Strava archive.

Usage:
    python strava_import.py           # dry run — shows what would be imported
    python strava_import.py --run     # actually writes to cache
"""

import csv
import gzip
import io
import json
import math
import re
import sys
from datetime import datetime, timezone

# Force UTF-8 output so non-ASCII activity names don't crash on Windows cp1252 consoles
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)
from pathlib import Path
import xml.etree.ElementTree as ET

ARCHIVE_DIR = Path(r"C:\Users\matic\Desktop\Python\random\Sports_coach\export_10377841")
CACHE_DIR   = Path(r"C:\Users\matic\Desktop\Python\random\Sports_coach\backend\data")
STREAMS_DIR = CACHE_DIR / "streams"
ACTS_FILE   = CACHE_DIR / "activities.json"
CSV_FILE    = ARCHIVE_DIR / "activities.csv"

DRY_RUN = "--run" not in sys.argv

STRAVA_TYPE_MAP = {
    "Run":                "Run",
    "Virtual Run":        "VirtualRun",
    "Trail Run":          "TrailRun",
    "Treadmill Workout":  "Treadmill",
    "Treadmill":          "Treadmill",
    "Ride":               "Ride",
    "Virtual Ride":       "VirtualRide",
    "Mountain Bike Ride": "MountainBikeRide",
    "Gravel Cycling":     "GravelRide",
    "E-Bike Ride":        "EBikeRide",
}


# ── CSV column indices (Strava export format) ─────────────────────────────────
COL_ID        = 0   # Activity ID
COL_DATE      = 1   # Activity Date  "Jun 8, 2026, 2:38:30 PM"
COL_NAME      = 2   # Activity Name
COL_TYPE      = 3   # Activity Type
COL_FILE      = 12  # Filename  "activities/XXXXXXXXXX.fit.gz"
COL_ELAPSED   = 15  # Elapsed Time (seconds) — second instance
COL_MOVING    = 16  # Moving Time (seconds)
COL_DIST_M    = 17  # Distance (meters) — second instance
COL_MAX_SPD   = 18  # Max Speed (m/s)
COL_AVG_SPD   = 19  # Average Speed (m/s)
COL_ELEV_GAIN = 20  # Elevation Gain (meters)
COL_ELEV_LOSS = 21  # Elevation Loss (meters)
COL_ELEV_LOW  = 22  # Elevation Low (meters)
COL_ELEV_HIGH = 23  # Elevation High (meters)
COL_MAX_HR    = 30  # Max Heart Rate — second instance
COL_AVG_HR    = 31  # Average Heart Rate
COL_MAX_WATTS = 32  # Max Watts
COL_AVG_WATTS = 33  # Average Watts
COL_CALORIES  = 34  # Calories
COL_AVG_TEMP  = 36  # Average Temperature


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fv(row, col, default=None):
    """Safely parse a float from a CSV row, returning default on empty/error."""
    try:
        v = row[col].strip()
        return float(v) if v else default
    except (IndexError, ValueError):
        return default


def _iv(row, col, default=None):
    try:
        v = row[col].strip()
        return int(float(v)) if v else default
    except (IndexError, ValueError):
        return default


def _sv(row, col, default=""):
    try:
        return row[col].strip() or default
    except IndexError:
        return default


DATE_FORMATS = [
    "%b %d, %Y, %I:%M:%S %p",
    "%b %d, %Y, %I:%M %p",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%dT%H:%M:%S",
]

def parse_strava_date(s: str):
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    raise ValueError(f"Cannot parse date: {s!r}")


def smooth(values, window=5):
    """Simple centred rolling-mean, ignoring None values."""
    n = len(values)
    out = []
    for i in range(n):
        half = window // 2
        lo, hi = max(0, i - half), min(n, i + half + 1)
        chunk = [v for v in values[lo:hi] if v is not None]
        out.append(sum(chunk) / len(chunk) if chunk else None)
    return out


def compute_distance(times, speeds):
    """Integrate speed over time to get cumulative distance array (meters)."""
    dist = 0.0
    dists = [0.0]
    for i in range(1, len(times)):
        dt = times[i] - times[i - 1]
        s_prev = speeds[i - 1] if speeds[i - 1] is not None else 0.0
        s_curr = speeds[i]     if speeds[i]     is not None else 0.0
        dist += (s_prev + s_curr) / 2.0 * max(0, dt)
        dists.append(round(dist, 2))
    return dists


# ── XML namespace stripping ───────────────────────────────────────────────────

def strip_ns(xml_bytes: bytes) -> bytes:
    """Remove all XML namespace declarations, prefixed attributes, and tag prefixes."""
    if xml_bytes.startswith(b'\xef\xbb\xbf'):  # strip UTF-8 BOM
        xml_bytes = xml_bytes[3:]
    xml_bytes = xml_bytes.lstrip()  # strip leading whitespace before <?xml declaration
    xml_bytes = re.sub(rb' xmlns(?::\w+)?="[^"]*"', b'', xml_bytes)  # xmlns declarations
    xml_bytes = re.sub(rb' \w+:\w+="[^"]*"', b'', xml_bytes)          # prefixed attributes (e.g. xsi:schemaLocation)
    xml_bytes = re.sub(rb'<(/?)[\w]+:', rb'<\1', xml_bytes)           # prefixed element tags
    return xml_bytes


# ── Stream parsers ────────────────────────────────────────────────────────────

def parse_tcx(content: bytes) -> dict | None:
    """Parse TCX XML (already decompressed) into stream arrays."""
    try:
        root = ET.fromstring(strip_ns(content))
    except ET.ParseError as e:
        print(f"    TCX parse error: {e}")
        return None

    trackpoints = root.findall(".//Trackpoint")
    if not trackpoints:
        return None

    raw_times, raw_hrs, raw_alts, raw_spds = [], [], [], []
    start_dt = None

    for tp in trackpoints:
        t_el = tp.find("Time")
        if t_el is None or not t_el.text:
            continue
        try:
            dt = datetime.fromisoformat(t_el.text.rstrip("Z") + "+00:00")
        except ValueError:
            continue
        if start_dt is None:
            start_dt = dt
        raw_times.append(int((dt - start_dt).total_seconds()))

        hr_el = tp.find(".//HeartRateBpm/Value")
        raw_hrs.append(int(float(hr_el.text)) if hr_el is not None and hr_el.text else None)

        alt_el = tp.find("AltitudeMeters")
        raw_alts.append(float(alt_el.text) if alt_el is not None and alt_el.text else None)

        spd_el = tp.find(".//Speed")
        raw_spds.append(float(spd_el.text) if spd_el is not None and spd_el.text else None)

    if len(raw_times) < 10:
        return None

    vel_smooth = smooth(raw_spds, window=5)
    distances  = compute_distance(raw_times, raw_spds)

    return {
        "time":            raw_times,
        "heartrate":       raw_hrs,
        "altitude":        raw_alts,
        "velocity_smooth": [round(v, 4) if v is not None else None for v in vel_smooth],
        "distance":        distances,
    }


def parse_gpx(content: bytes) -> dict | None:
    """Parse GPX XML into stream arrays."""
    try:
        root = ET.fromstring(strip_ns(content))
    except ET.ParseError as e:
        print(f"    GPX parse error: {e}")
        return None

    trackpoints = root.findall(".//trkpt")
    if not trackpoints:
        return None

    raw_times, raw_hrs, raw_alts, raw_spds = [], [], [], []
    start_dt = None

    for tp in trackpoints:
        t_el = tp.find("time")
        if t_el is None or not t_el.text:
            continue
        try:
            dt = datetime.fromisoformat(t_el.text.rstrip("Z") + "+00:00")
        except ValueError:
            continue
        if start_dt is None:
            start_dt = dt
        raw_times.append(int((dt - start_dt).total_seconds()))

        ele_el = tp.find("ele")
        raw_alts.append(float(ele_el.text) if ele_el is not None and ele_el.text else None)

        # Garmin TrackPoint extensions (hr and speed)
        hr_el  = tp.find(".//hr")
        raw_hrs.append(int(float(hr_el.text)) if hr_el is not None and hr_el.text else None)

        spd_el = tp.find(".//speed")
        raw_spds.append(float(spd_el.text) if spd_el is not None and spd_el.text else None)

    if len(raw_times) < 10:
        return None

    vel_smooth = smooth(raw_spds, window=5)
    distances  = compute_distance(raw_times, raw_spds)

    return {
        "time":            raw_times,
        "heartrate":       raw_hrs,
        "altitude":        raw_alts,
        "velocity_smooth": [round(v, 4) if v is not None else None for v in vel_smooth],
        "distance":        distances,
    }


def parse_fit(content: bytes) -> dict | None:
    """Parse FIT binary data into stream arrays (requires fitparse)."""
    try:
        import fitparse
    except ImportError:
        return None
    try:
        ff = fitparse.FitFile(content)
    except Exception as e:
        print(f"    FIT parse error: {e}")
        return None

    raw_times, raw_hrs, raw_alts, raw_spds, raw_dists = [], [], [], [], []
    start_dt = None

    for msg in ff.get_messages("record"):
        fields = {f.name: f.value for f in msg.fields}
        ts = fields.get("timestamp")
        if ts is None:
            continue
        if start_dt is None:
            start_dt = ts
        raw_times.append(int((ts - start_dt).total_seconds()))

        raw_hrs.append(fields.get("heart_rate"))

        alt = fields.get("enhanced_altitude") or fields.get("altitude")
        raw_alts.append(float(alt) if alt is not None else None)

        spd = fields.get("enhanced_speed") or fields.get("speed")
        raw_spds.append(float(spd) if spd is not None else None)

        dist = fields.get("distance")
        raw_dists.append(float(dist) if dist is not None else None)

    if len(raw_times) < 10:
        return None

    vel_smooth = smooth(raw_spds, window=5)
    # Use device distance if available, otherwise integrate speed
    distances = (
        raw_dists
        if all(d is not None for d in raw_dists[:10])
        else compute_distance(raw_times, raw_spds)
    )

    return {
        "time":            raw_times,
        "heartrate":       raw_hrs,
        "altitude":        raw_alts,
        "velocity_smooth": [round(v, 4) if v is not None else None for v in vel_smooth],
        "distance":        [round(d, 2) if d is not None else None for d in distances],
    }


def load_stream_file(filepath: Path) -> dict | None:
    """Decompress and parse a Strava activity file."""
    name = filepath.name.lower()
    try:
        if name.endswith(".fit.gz"):
            with gzip.open(filepath, "rb") as f:
                return parse_fit(f.read())
        elif name.endswith(".tcx.gz"):
            with gzip.open(filepath, "rb") as f:
                return parse_tcx(f.read())
        elif name.endswith(".gpx.gz"):
            with gzip.open(filepath, "rb") as f:
                return parse_gpx(f.read())
        elif name.endswith(".gpx"):
            return parse_gpx(filepath.read_bytes())
        else:
            return None
    except Exception as e:
        print(f"    Error reading {filepath.name}: {e}")
        return None


# ── Activity dict builder ─────────────────────────────────────────────────────

def build_activity(row: list) -> dict:
    strava_id = _sv(row, COL_ID)
    act_id    = f"strava_{strava_id}"
    strava_type  = _sv(row, COL_TYPE)
    icu_type     = STRAVA_TYPE_MAP.get(strava_type, strava_type)

    try:
        dt_local = parse_strava_date(_sv(row, COL_DATE))
        start_date_local = dt_local.strftime("%Y-%m-%dT%H:%M:%S")
        # Treat the date as is (Strava exports local time already)
    except ValueError:
        start_date_local = ""

    return {
        "id":                  act_id,
        "strava_id":           strava_id,
        "source":              "STRAVA_ARCHIVE",
        "type":                icu_type,
        "name":                _sv(row, COL_NAME, "Activity"),
        "start_date_local":    start_date_local,
        "elapsed_time":        _iv(row, COL_ELAPSED, 0),
        "moving_time":         _iv(row, COL_MOVING, 0),
        "distance":            _fv(row, COL_DIST_M, 0.0),
        "average_speed":       _fv(row, COL_AVG_SPD),
        "max_speed":           _fv(row, COL_MAX_SPD),
        "total_elevation_gain": _fv(row, COL_ELEV_GAIN, 0.0),
        "total_elevation_loss": _fv(row, COL_ELEV_LOSS, 0.0),
        "min_altitude":        _fv(row, COL_ELEV_LOW),
        "max_altitude":        _fv(row, COL_ELEV_HIGH),
        "average_heartrate":   _fv(row, COL_AVG_HR),
        "max_heartrate":       _iv(row, COL_MAX_HR),
        "has_heartrate":       bool(_fv(row, COL_AVG_HR)),
        "average_watts":       _fv(row, COL_AVG_WATTS),
        "max_watts":           _iv(row, COL_MAX_WATTS),
        "calories":            _iv(row, COL_CALORIES),
        "average_temp":        _fv(row, COL_AVG_TEMP),
        "commute":             _sv(row, 9, "false").lower() == "true",
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    mode = "DRY RUN -- pass --run to apply changes" if DRY_RUN else "LIVE RUN -- writing to cache"
    print(f"{mode}\n")

    # Load existing cache
    with open(ACTS_FILE, encoding="utf-8") as f:
        cached_acts = json.load(f)
    cached_strava_ids = {str(a.get("strava_id", "")) for a in cached_acts if a.get("strava_id")}
    # Also collect IDs already imported from a previous run of this script
    cached_strava_ids |= {
        a["id"].replace("strava_", "")
        for a in cached_acts
        if str(a.get("id", "")).startswith("strava_")
    }
    print(f"Existing cache: {len(cached_acts)} activities, {len(cached_strava_ids)} with strava_id\n")

    # Read CSV
    with open(CSV_FILE, encoding="utf-8") as f:
        rows = list(csv.reader(f))
    header, data_rows = rows[0], rows[1:]

    wanted_rows = [
        r for r in data_rows
        if r[COL_TYPE] in STRAVA_TYPE_MAP
        and r[COL_ID] not in cached_strava_ids
    ]
    print(f"Missing Run/Ride activities to import: {len(wanted_rows)}\n")

    new_acts = []
    streams_ok = 0
    streams_fail = 0

    for row in wanted_rows:
        strava_id = _sv(row, COL_ID)
        name      = _sv(row, COL_NAME, "Activity")
        date_s    = _sv(row, COL_DATE)
        file_rel  = _sv(row, COL_FILE)
        sport     = _sv(row, COL_TYPE)

        print(f"  {strava_id}  {date_s[:22]:<24}  {sport:<20}  {name[:32]}")

        act = build_activity(row)
        new_acts.append(act)

        # Try to parse stream data
        stream = None
        if file_rel:
            act_file = ARCHIVE_DIR / file_rel
            if act_file.exists():
                stream = load_stream_file(act_file)
            else:
                print(f"    ⚠  file not found: {act_file.name}")

        if stream:
            streams_ok += 1
            hr_count = sum(1 for h in stream["heartrate"] if h is not None)
            print(f"    OK {len(stream['time'])} points, {hr_count} HR samples")
            if not DRY_RUN:
                stream_path = STREAMS_DIR / f"strava_{strava_id}.json"
                stream_path.write_text(json.dumps(stream), encoding="utf-8")
        else:
            streams_fail += 1
            if file_rel:
                print(f"    FAIL stream parse failed (metadata only)")
            else:
                print(f"    NO FILE metadata only")

    print(f"\n{'-'*60}")
    print(f"Activities to add:  {len(new_acts)}")
    print(f"Streams parsed OK:  {streams_ok}")
    print(f"Streams failed:     {streams_fail}")

    if DRY_RUN:
        print("\n[DRY RUN] No changes written. Re-run with --run to apply.")
        return

    # Append new activities and save
    merged = cached_acts + new_acts
    merged.sort(key=lambda a: a.get("start_date_local", ""))
    with open(ACTS_FILE, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False)

    print(f"\nDONE: activities.json updated: {len(cached_acts)} -> {len(merged)} entries")
    print(f"DONE: streams written to {STREAMS_DIR}")


if __name__ == "__main__":
    main()
