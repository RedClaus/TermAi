#!/bin/bash
# TermAi Server Startup Script

cd /home/normanking/github/TermAi/server

# Check if server is already running
if pgrep -f "node index.js" > /dev/null; then
    echo "TermAi server is already running"
    exit 0
fi

# Start the server in the background
echo "Starting TermAi server..."
nohup node index.js > /dev/null 2>&1 &

# Wait a moment and check if it started successfully
sleep 2
if pgrep -f "node index.js" > /dev/null; then
    echo "TermAi server started successfully"
else
    echo "Failed to start TermAi server"
fi
