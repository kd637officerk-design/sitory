@echo off
setlocal
cd /d "%~dp0.."

echo Starting Bill World Windows 11 Photo Opener...
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)

start "" /B cmd /c "npm run dev"
timeout /t 3 /nobreak >nul

set "EDGE_PATH=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE_PATH%" set "EDGE_PATH=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if exist "%EDGE_PATH%" (
  start "" "%EDGE_PATH%" --app=http://localhost:3000
) else (
  start "" http://localhost:3000
)
