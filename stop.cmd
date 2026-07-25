@echo off
REM Stop DeskPet4OpenClaw Web Dev Server (port 18900)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18900.*LISTENING"') do (
  taskkill /f /pid %%a >nul 2>&1
  echo DeskPet4OpenClaw server stopped (PID: %%a)
  goto :done
)
echo No server found on port 18900
:done
