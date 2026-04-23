#!/bin/bash

# Startup script for Distributed Drawing Board with Mini-RAFT Consensus
# Usage: ./start.sh

set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

echo "========================================="
echo "Distributed Drawing Board - Startup"
echo "========================================="
echo ""

# Check if Docker is running
echo "[1/5] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Please install Docker Desktop."
    exit 1
fi
echo "✅ Docker found"

# Check if Docker Compose is available
echo "[2/5] Checking Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not found. Please install Docker Compose."
    exit 1
fi
echo "✅ Docker Compose ready"

# Change to project directory
cd "$PROJECT_DIR"
echo "[3/5] Project directory: $PROJECT_DIR"

# Remove old containers if they exist
echo "[4/5] Cleaning up old containers..."
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start containers
echo "[5/5] Building and starting containers..."
docker-compose up -d

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start (10 seconds)..."
sleep 10

# Check if services are running
echo ""
echo "========================================="
echo "Services Status:"
echo "========================================="
docker-compose ps

echo ""
echo "========================================="
echo "✅ Startup Complete!"
echo "========================================="
echo ""
echo "🌐 Frontend URL: http://localhost"
echo "🔗 Gateway WebSocket: ws://localhost:3000/ws"
echo ""
echo "📊 Replica Status URLs:"
echo "   Replica 1: http://localhost:5001/status"
echo "   Replica 2: http://localhost:5002/status"
echo "   Replica 3: http://localhost:5003/status"
echo ""
echo "📋 View Logs:"
echo "   docker-compose logs -f"
echo "   docker-compose logs -f replica1"
echo "   docker-compose logs -f gateway"
echo ""
echo "🛑 Stop Services:"
echo "   docker-compose stop"
echo ""
echo "🔄 Restart Services:"
echo "   docker-compose restart"
echo ""
echo "❌ Shutdown:"
echo "   docker-compose down"
echo ""
echo "========================================="
