"""Daily readiness score + Acute:Chronic Workload Ratio (ACWR).

Readiness = weighted average of three components vs 7-day rolling baseline:
  - 40% HRV deviation  (higher = better)
  - 35% Sleep score    (raw 0-100, higher = better)
  - 25% Resting HR     (lower = better, inverted ratio vs baseline)

Each HRV/RHR component maps ratio-to-baseline onto 0-100:
  ratio 0.5 → 0, ratio 1.0 → 50, ratio 1.5 → 100

ACWR = 7-day training load / (28-day load / 4)
  Optimal zone: 0.8 – 1.3
"""
from datetime import date, timedelta
from .. import cache


def _roll_avg(series, window):
    out = []
    for i in range(len(series)):
        vals = [v for v in series[max(0, i - window + 1):i + 1] if v is not None]
        out.append(sum(vals) / len(vals) if vals else None)
    return out


def _ratio_score(val, baseline, higher_is_better=True):
    """Map val/baseline to 0-100. Ratio 1.0 → 50, 1.5 → 100, 0.5 → 0."""
    if val is None or baseline is None or baseline == 0:
        return None
    ratio = val / baseline if higher_is_better else baseline / val
    return max(0.0, min(100.0, (ratio - 0.5) * 100))


def compute(start=None, end=None):
    wellness = cache.load_wellness()
    activities = cache.load_activities()

    if not wellness:
        return {"daily": [], "today": None}

    # ── wellness lookup ──────────────────────────────────────────────────────
    w_by_date = {}
    for entry in wellness:
        d = (entry.get("id") or "")[:10]
        if d:
            w_by_date[d] = entry

    def _get(d, *keys):
        e = w_by_date.get(d, {})
        for k in keys:
            v = e.get(k)
            if v is not None:
                try:
                    return float(v)
                except (ValueError, TypeError):
                    pass
        return None

    # ── activity load lookup (minutes) ──────────────────────────────────────
    load_by_date: dict[str, float] = {}
    for act in activities:
        d = (act.get("start_date_local") or "")[:10]
        if d:
            secs = act.get("moving_time") or act.get("elapsed_time") or 0
            load_by_date[d] = load_by_date.get(d, 0.0) + secs / 60.0

    # ── build date range (last 120 days) ────────────────────────────────────
    today = date.today()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(119, -1, -1)]

    hrv_s   = [_get(d, "hrv", "hrvSdnn") for d in dates]
    sleep_s = [_get(d, "sleepScore", "sleep_score") for d in dates]
    rhr_s   = [_get(d, "restingHR", "resting_hr") for d in dates]
    load_s  = [load_by_date.get(d, 0.0) for d in dates]

    hrv_avg7 = _roll_avg(hrv_s, 7)
    rhr_avg7 = _roll_avg(rhr_s, 7)

    daily = []
    for i, d in enumerate(dates):
        hrv_sc   = _ratio_score(hrv_s[i], hrv_avg7[i], higher_is_better=True)
        sleep_sc = sleep_s[i]  # already 0-100
        rhr_sc   = _ratio_score(rhr_s[i], rhr_avg7[i], higher_is_better=False)

        # Weighted readiness (normalise by sum of available weights)
        parts = [(hrv_sc, 0.40), (sleep_sc, 0.35), (rhr_sc, 0.25)]
        available = [(sc, w) for sc, w in parts if sc is not None]
        if available:
            total_w = sum(w for _, w in available)
            readiness = sum(sc * w for sc, w in available) / total_w
        else:
            readiness = None

        # ACWR
        acute   = sum(load_s[max(0, i - 6):i + 1])
        c_win   = load_s[max(0, i - 27):i + 1]
        n_weeks = len(c_win) / 7
        chronic = sum(c_win) / n_weeks if n_weeks > 0 else 0
        acwr    = round(acute / chronic, 2) if chronic > 0 else None

        if readiness is not None or acwr is not None:
            daily.append({
                "date":        d,
                "readiness":   round(readiness, 1) if readiness is not None else None,
                "acwr":        acwr,
                "hrv_score":   round(hrv_sc, 1)   if hrv_sc   is not None else None,
                "sleep_score": round(sleep_sc, 1)  if sleep_sc is not None else None,
                "rhr_score":   round(rhr_sc, 1)    if rhr_sc   is not None else None,
            })

    return {
        "daily": daily,
        "today": daily[-1] if daily else None,
    }
