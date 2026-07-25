#!/bin/bash
# Stop DeskPet4OpenClaw Web Dev Server (port 18900)
PID=$(lsof -ti:18900 2>/dev/null || netstat -ano 2>/dev/null | grep ':18900' | awk '{print $5}')
if [ -n "$PID" ]; then
  kill $PID 2>/dev/null
  echo "DeskPet4OpenClaw server stopped (PID: $PID)"
else
  echo "No server found on port 18900"
fi
