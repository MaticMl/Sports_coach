@echo off
echo Starting Sports Coach...
echo.

REM Check if .env exists
if not exist "backend\.env" (
    echo ERROR: backend\.env not found.
    echo Copy backend\.env.example to backend\.env and fill in your API key and athlete ID.
    echo Get your API key at: intervals.icu ^> Settings ^> API Access
    pause
    exit /b 1
)

REM Start backend in new window
echo Starting backend (FastAPI on port 8000)...
start "Sports Coach - Backend" cmd /k "cd /d %~dp0backend && pip install -r requirements.txt -q && python -m uvicorn app.main:app --reload --port 8000"

REM Wait a moment then start frontend
timeout /t 3 /nobreak >nul

REM Install frontend deps if needed
if not exist "frontend\node_modules" (
    echo Installing frontend dependencies...
    cd /d %~dp0frontend
    call npm install
    cd /d %~dp0
)

REM Start frontend in new window
echo Starting frontend (Vite on port 5173)...
start "Sports Coach - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Dashboard will open at: http://localhost:5173
echo Backend API at:         http://localhost:8000/docs
echo.
echo First time? Click "Sync Now" in the dashboard to load your data from intervals.icu
echo (Initial sync fetches all activity streams - may take several minutes)
echo.
timeout /t 4 /nobreak >nul
start http://localhost:5173
