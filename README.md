# Sports Coach Dashboard

Personalized training insights from your intervals.icu data — React dashboard + Python analytics backend + daily AI agent reports.

## Quick Start

### 1. Get your intervals.icu credentials
- Go to [intervals.icu](https://intervals.icu) → **Settings → API Access** → copy your API key
- Your athlete ID is in the URL when logged in: `intervals.icu/i12345/...` (the `i12345` part)

### 2. Configure
```
cd backend
copy .env.example .env
```
Edit `.env`:
```
INTERVALS_API_KEY=your_actual_key
ATHLETE_ID=i12345
```

### 3. Launch
Double-click **`start.bat`** — it starts both servers and opens the dashboard.

Or manually:
```bash
# Terminal 1 — backend
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

Dashboard: http://localhost:5173  
API docs: http://localhost:8000/docs

### 4. Sync your data
Click **"Sync Now"** in the dashboard header. The first sync fetches ALL your activity streams — this can take **5–30 minutes** depending on how many activities you have. Subsequent syncs only fetch new activities (fast).

Progress is shown in the header bar. You can close and re-open the dashboard; data is cached locally in `backend/data/`.

---

## Generating the Daily AI Report

Click **"Export AI Report"** in the dashboard, or run:
```
generate_report.bat
```

Two files appear in `backend/output/`:
- `report_YYYY-MM-DD.md` — narrative markdown for pasting into an AI agent
- `report_YYYY-MM-DD.json` — structured data for programmatic analysis

---

## Dashboard Panels

| Panel | What it shows |
|-------|---------------|
| **HR Drift Detection** | For Z2 rides/runs: HR progression across 1-min (run) / 3-min (cycling) segments. Aerobic decoupling % — >5% signals pacing issues. |
| **Intensity Distribution** | Weekly time in each HR zone (Z1–Z5), sport split (run vs ride), and all-time zone pie. |
| **Run Progression** | Weekly volume trend, Z2 pace improvement over time, HR at standard pace bins by quarter. |
| **Interference Detection** | Run impact after hard cycling days, HRV vs training load correlation, sleep quality vs load, weekly TSS balance. |
| **Climb / VAM** | Detected climbs from cycling activities: VAM vs HR scatter, quarterly VAM trend, recent climb list. |
| **Pace / HR Efficiency** | 1-min running segments: pace vs HR scatter colored by quarter, aerobic efficiency trend, regression by period. |
| **Wellness** | HRV, sleep score, weight, resting HR — 90-day trends from intervals.icu wellness data. |

---

## Data & Privacy
All data is cached locally in `backend/data/`. Nothing is sent anywhere except to the intervals.icu API for your own data.

## Troubleshooting
- **CORS error**: Make sure backend is running on port 8000
- **401 Unauthorized**: Check your API key in `.env`
- **No data in charts**: Click Sync Now and wait for streams to download
- **Slow initial sync**: Normal — fetching thousands of activity streams takes time. Leave it running.
