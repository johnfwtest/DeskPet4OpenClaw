@echo off
REM Start DeskPet4OpenClaw Web Dev Server
cd /d "%~dp0"
echo Starting DeskPet4OpenClaw web server on http://localhost:18900 ...
call pnpm dev
