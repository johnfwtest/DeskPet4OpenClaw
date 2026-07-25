#!/bin/bash
# Start DeskPet4OpenClaw Web Dev Server
cd "$(dirname "$0")"
echo "Starting DeskPet4OpenClaw web server on http://localhost:18900 ..."
pnpm dev
