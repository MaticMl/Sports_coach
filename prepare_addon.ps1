# Copies backend/ and frontend/ into sports_coach/ ready for a git push + HA build.
# Run this script from the project root before committing a new release.

$src = $PSScriptRoot
$dst = Join-Path $src "sports_coach"

Write-Host "Syncing backend -> sports_coach/backend..."
robocopy "$src\backend"  "$dst\backend"  /MIR /XD __pycache__ .venv /XF "*.pyc" "*.env" | Out-Null

Write-Host "Syncing frontend -> sports_coach/frontend..."
robocopy "$src\frontend" "$dst\frontend" /MIR /XD node_modules dist .vite | Out-Null

Write-Host "Done. Review changes, then: git add -A && git commit && git push"
