@echo off
cd /d "%~dp0"
set PORT=3001
set JWT_SECRET=sekaru-prod-secret-key-2026
set MASTER_PASSWORD=sekaro2026
echo Starting SEKARU server...
echo Open http://localhost:%PORT%
echo.
node server.js
pause
