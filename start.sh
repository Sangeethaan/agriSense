#!/bin/bash
# AgriSense — clean start script
# Kills any leftover processes on dev ports, then starts the app.

echo "🧹 Clearing dev ports..."
for port in 3000 5173 5174 5175 5176; do
  pid=$(lsof -ti:$port 2>/dev/null)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null
    echo "   Killed process on port $port (PID $pid)"
  fi
done

echo "🚀 Starting AgriSense..."
npm start
