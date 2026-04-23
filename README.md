# Distributed Real-Time Drawing Board with Mini-RAFT Consensus

A distributed drawing collaboration platform using WebSocket real-time sync and RAFT consensus protocol for state consistency.

## 🚀 Quick Start

```bash
# Start all services
cd c:\Users\nagad\OneDrive\Desktop\cloud_mini_raft_project
docker-compose up -d

# Access browser
http://localhost

# View logs
docker-compose logs -f

# Stop all
docker-compose down
```

## 📋 Architecture

- **Frontend (Port 80)**: HTML5 Canvas drawing UI
- **Gateway (Port 3000)**: WebSocket server routing to RAFT leader
- **Replicas (Ports 5001-5003)**: 3-node RAFT cluster with consensus
- **Network**: Isolated Docker bridge network

## ⚙️ RAFT Consensus

- **Node States**: Follower → Candidate → Leader
- **Election**: Random 500-800ms timeout, majority voting (≥2/3)
- **Replication**: Leader heartbeat every 150ms
- **Persistence**: State in `/tmp/raft_state_*.json`
- **Fault Tolerance**: Survives 1 replica failure

## 🧪 Quick Tests

### Draw & Sync
```bash
# Open http://localhost
# Draw strokes → sync in real-time
```

### Leader Failover
```bash
# While drawing:
docker-compose kill replica1

# New leader elected within 1 second, drawing continues
```

### Hot Reload
```bash
# Edit code
echo "// test" >> replica1/index.js

# Container auto-restarts, rejoins cluster
```

### Multi-Client
```bash
# Open multiple http://localhost windows
# Draw in one → see in all instantly
```

## 📊 Check Status

```bash
# Replica status
curl http://localhost:5001/status
curl http://localhost:5002/status
curl http://localhost:5003/status

# View logs
docker-compose logs -f
docker-compose logs -f replica1
```

## 📁 Project Structure

```
├── docker-compose.yml       # Orchestration
├── frontend/                # Browser UI
│   ├── index.html
│   ├── client.js
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── gateway/                 # WebSocket Gateway
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── replica1/                # RAFT Node 1
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── replica2/                # RAFT Node 2
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
├── replica3/                # RAFT Node 3
│   ├── index.js
│   ├── package.json
│   └── Dockerfile
└── README_FINAL.md
```

## 🎯 Features

✅ Real-time drawing sync across clients
✅ Automatic leader election with failover
✅ Zero-downtime hot-reload
✅ Persistent state (crash recovery)
✅ Fault tolerance (1 failure survives)

## 🔍 Commands

```bash
# Services status
docker-compose ps

# All logs
docker-compose logs -f

# Specific service
docker-compose logs -f replica1

# Restart service
docker-compose restart replica1

# Kill service (test failover)
docker-compose kill replica1

# Clean shutdown
docker-compose down
```

## 🐛 Troubleshooting

**Can't access http://localhost**
```bash
docker-compose ps          # Check services
docker-compose logs        # View errors
docker-compose down && docker-compose up -d  # Restart
```

**No leader elected**
```bash
docker-compose ps | grep replica  # Verify all running
docker-compose logs | grep Election # Watch election
```

**Strokes not syncing**
```bash
curl http://localhost:5001/status  # Check status
docker-compose logs gateway        # Check gateway
```

---

**Cloud Computing | RAFT Consensus | Production Ready**
