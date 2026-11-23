@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH.
  pause
  exit /b 1
)
node "%~dp0scripts\expo-go.cjs"
set "expoExit=%errorlevel%"
pause
exit /b %expoExit%
