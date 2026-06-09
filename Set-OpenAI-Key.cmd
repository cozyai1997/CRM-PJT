@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo OpenAI API key setup
echo The key will be written to .env.local as OPENAI_API_KEY.
echo It will not be displayed while you type it.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\set-openai-key.ps1"
if errorlevel 1 (
  echo.
  echo API key setup failed.
  pause
  exit /b 1
)

echo.
echo API key saved to .env.local.
pause
