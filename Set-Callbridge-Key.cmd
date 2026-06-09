@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo Callbridge setup
echo API key, display number, and tunnel URLs will be written to .env.local.
echo Secret values will not be displayed while you type them.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-callbridge-key.ps1"
if errorlevel 1 (
  echo.
  echo Callbridge setup failed.
  pause
  exit /b 1
)

echo.
echo Callbridge configuration saved to .env.local.
pause
