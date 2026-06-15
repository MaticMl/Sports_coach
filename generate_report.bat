@echo off
echo Generating daily AI report...
cd /d %~dp0backend
python -c "import asyncio; from app.report import generate; md, js = generate(); print(f'Report saved:\n  {md}\n  {js}')"
echo.
echo Feed the .md file to an AI agent for analysis.
pause
