# Project Overview - Cloud Mini RAFT

## What Is This?
A **real-time collaborative drawing app** where multiple users draw together, and all drawings stay synchronized across all devices using **RAFT consensus protocol**.

## How It Works

### The Simple Version
1. You draw on a webpage (canvas)
2. Drawing gets sent to a gateway (traffic controller)
3. Gateway sends it to a leader server (RAFT)
4. Leader replicates to 2 backup servers (RAFT)
5. All servers agree on the drawing → Everyone sees the same thing

### The Components

| Part | Job | Port |
|------|-----|------|
| **Frontend** | Drawing canvas UI (browser) | 80 |
| **Gateway** | Receives drawings, routes to leader | 3000 |
| **Replica 1, 2, 3** | 3 servers that store & agree on drawings | 5001, 5002, 5003 |

## Why RAFT?

**RAFT = Voting Protocol**
- All 3 servers vote on who's the leader
- Leader handles all drawing updates
- If leader dies, other servers vote for new leader
- Everything stays consistent automatically

**Benefits:**
- ✅ Can lose 1 server and still work
- ✅ Data never gets lost or corrupted
- ✅ Real-time sync across all users

## How Each Component Works

### 🎨 Frontend (Port 80)
**What it is:** The webpage you see in your browser  
**What it does:**
- Shows a blank canvas where you can draw with your mouse
- Sends each brush stroke to the Gateway via WebSocket (instant connection)
- Receives drawing updates from other users and displays them
- Shows current drawings on screen in real-time

**Example:** You draw a circle → browser sends "draw circle at (100,200)" → gateway receives it

---

### 🚪 Gateway (Port 3000)
**What it is:** The traffic controller / receptionist  
**What it does:**
- Listens for drawing commands from the Frontend
- Acts as the **middleman between browsers and servers**
- Forwards all drawings to the **Leader RAFT server** (the main decision maker)
- Broadcasts leader's decisions back to all connected browsers
- Maintains WebSocket connections to keep things real-time

**Example:** 
1. Browser says "I drew a line"
2. Gateway receives it
3. Gateway asks Leader: "Is this ok?"
4. Leader approves
5. Gateway tells all browsers: "Everyone draw this line"

---

### 🖥️ Replica Servers (Ports 5001, 5002, 5003)
**What they are:** 3 identical backup servers running the RAFT consensus algorithm  
**What they do:**

**The Leader (whoever wins the election):**
- Receives drawing commands from Gateway
- Stores them in memory
- Replicates to Replica 2 & 3 (makes copies)
- Sends confirmation back to Gateway
- Sends heartbeat every 150ms to stay leader

**The Followers (the other 2 replicas):**
- Listen to Leader's heartbeat
- Receive copies of all drawings
- Store the same data as Leader
- Vote during elections

**During Election (if Leader dies):**
- Followers notice no heartbeat from Leader (after 500-800ms)
- They all start competing to be new leader
- Majority vote (2 out of 3) determines winner
- New leader continues handling drawings

**Example Timeline:**
```
Time 0s:   Replica 1 = Leader, has drawing #1, #2, #3
Time 1s:   You draw new line (drawing #4)
Time 1.05s: Replica 1 sends drawing #4 to Replica 2 & 3
Time 1.1s:  Replica 2 & 3 acknowledge: "We have #4"
Time 1.15s: Leader sends drawing #4 to Gateway
Time 1.2s:  Gateway broadcasts to all browsers → Everyone sees line #4
```

---

### 🔄 How They Work Together

```
User 1 Draws          User 2 Draws
    ↓                    ↓
[Frontend 1]          [Frontend 2]
    ↓                    ↓
    └─→ [Gateway] ←─────┘
        ↓
    [Leader Replica]
        ↓
    [Replica 2 & 3]  ← Copy everything
        ↓
    Approval ✅
        ↓
    [Gateway broadcasts back]
        ↓
[Frontend 1 & 2 both show same drawing]
```

**Key Point:** Every drawing decision goes through the Leader. Followers just copy. This ensures everyone sees exactly the same thing.

---

## Quick Test

**Normal Drawing:**
- Open `http://localhost`
- Draw something → appears instantly for all users

**Server Failure Test:**
- While drawing, kill a server: `docker-compose kill replica1`
- App keeps working! New leader elected in <1 second

## Files Location
```
c:\Users\nagad\OneDrive\Desktop\cloud_mini_raft_project\
├─ frontend/     → Web UI (HTML + Canvas)
├─ gateway/      → Entry point (Node.js)
├─ replica1,2,3/ → RAFT servers (Node.js)
└─ docker-compose.yml → Runs everything in containers
```

## Start/Stop

**Start:** `docker-compose up -d`  
**Stop:** `docker-compose down`  
**View logs:** `docker-compose logs -f`

---

**In one sentence:** *A drawing app where servers automatically agree on what's drawn, even if some fail.*
