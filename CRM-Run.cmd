@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo Starting CRM-PJT...

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js first, then run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm is required. Reinstall Node.js with npm, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

set "OPENAI_CONFIGURED="
if exist ".env.local" (
  findstr /b /c:"OPENAI_API_KEY=sk-" ".env.local" >nul 2>nul
  if not errorlevel 1 set "OPENAI_CONFIGURED=1"
)

if not defined OPENAI_CONFIGURED (
  echo.
  echo OPENAI_API_KEY is not configured.
  choice /m "Configure OpenAI API key now"
  if errorlevel 2 goto skip_openai_key_setup
  call "%~dp0Set-OpenAI-Key.cmd"
  if errorlevel 1 (
    echo OpenAI API key setup failed.
    pause
    exit /b 1
  )
  set "OPENAI_CONFIGURED=1"
)

:skip_openai_key_setup
if not defined OPENAI_CONFIGURED (
  echo.
  echo The app will still open, but OpenAI features require OPENAI_API_KEY.
)

if exist ".env.local" (
  findstr /b /c:"SOLAPI_API_KEY=" ".env.local" >nul 2>nul
  if errorlevel 1 (
    echo Solapi is not configured. Run Set-Solapi-Key.cmd to enable real SMS delivery.
  )
) else (
  echo Solapi is not configured. Run Set-Solapi-Key.cmd to enable real SMS delivery.
)

if exist ".env.local" (
  findstr /b /c:"CALLBRIDGE_API_KEY=" ".env.local" >nul 2>nul
  if errorlevel 1 (
    echo Callbridge is not configured. Run Set-Callbridge-Key.cmd to enable browser call center features.
  )
) else (
  echo Callbridge is not configured. Run Set-Callbridge-Key.cmd to enable browser call center features.
)

echo Building CRM UI...
call npm.cmd run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo Opening browser at http://127.0.0.1:8787/
start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8787/'"

echo CRM server is running. Close this window to stop it.
call npm.cmd run start

pause
