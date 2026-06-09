@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo Solapi setup
echo API Key, API Secret, and sender number will be written to .env.local.
echo Secret values will not be displayed while you type them.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-solapi-key.ps1"
if errorlevel 1 (
  echo.
  echo Solapi setup failed.
  pause
  exit /b 1
)

echo.
echo Solapi configuration saved to .env.local.
pause
