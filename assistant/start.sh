#!/bin/bash

# Set default port if not provided
PORT="${PORT:-8000}"

# Start the FastAPI service in the background
python -m uvicorn main:app --host 0.0.0.0 --port ${PORT} &
FASTAPI_PID=$!

# Start the health check script in the background
python health_check.py &
HEALTH_PID=$!

# Function to cleanup processes
cleanup() {
    echo "Stopping services..."
    kill $FASTAPI_PID
    kill $HEALTH_PID
    exit 0
}

# Setup signal trapping
trap cleanup SIGINT SIGTERM

# Wait for either process to exit
wait $FASTAPI_PID $HEALTH_PID 