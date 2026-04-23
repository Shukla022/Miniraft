# ⚠️ Docker Desktop Not Running

## What to Do

### Step 1: Start Docker Desktop
1. Open **Start Menu** on Windows
2. Search for **Docker Desktop**
3. Click to launch it
4. Wait for Docker icon to appear in system tray
5. When ready, you'll see a checkmark notification

This takes 30-60 seconds typically.

### Step 2: Start the Project

Once Docker Desktop is running, execute in PowerShell:

```powershell
cd c:\Users\nagad\OneDrive\Desktop\cloud_mini_raft_project
docker-compose up -d
```

### Step 3: Verify It's Working

```powershell
# Check all services are running
docker-compose ps

# Expected output should show 4 running containers:
# frontend, gateway, replica1, replica2, replica3
```

### Step 4: Access the Application

Open your browser and go to:
- **http://localhost**

You should see a drawing canvas. Try drawing - it will sync across the distributed system!

## Verify Leader Election

```powershell
# Check which replica is the leader
curl http://localhost:5001/status | jq .isLeader
curl http://localhost:5002/status | jq .isLeader
curl http://localhost:5003/status | jq .isLeader

# One should return: "isLeader": true
```

## Test Failover

```powershell
# While drawing in the browser, kill the leader:
docker-compose kill replica1

# Within 1-2 seconds, a new leader is elected
# Drawing continues WITHOUT interruption!
```

## View Logs

```powershell
# See what's happening in real-time
docker-compose logs -f

# Or specific service
docker-compose logs -f replica1
docker-compose logs -f gateway
```

## Stop Everything

```powershell
docker-compose down
```

---

**Once Docker Desktop is running, restart the commands above! ✅**
