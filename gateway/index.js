const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const REPLICA_HOSTS = (process.env.REPLICA_HOSTS || 'replica1:5001,replica2:5002,replica3:5003').split(',').map(h => {
    const [host, port] = h.trim().split(':');
    return { host, port: parseInt(port) };
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// State
let connectedClients = new Set();
let currentLeader = null;
let clusterStatus = {
    leader: null,
    term: 0,
    replicas: 0,
    logSize: 0
};

// Discover leader
async function discoverLeader() {
    for (const replica of REPLICA_HOSTS) {
        try {
            const response = await axios.get(
                `http://${replica.host}:${replica.port}/status`,
                { timeout: 1000 }
            );
            if (response.data.isLeader) {
                currentLeader = replica;
                clusterStatus.leader = response.data.replicaId;
                clusterStatus.term = response.data.term;
                clusterStatus.replicas = response.data.healthyReplicas || 2;
                clusterStatus.logSize = response.data.logSize || 0;
                return true;
            }
        } catch (e) {
            // Replica might be down
        }
    }
    return false;
}

// Update leader periodically
setInterval(async () => {
    await discoverLeader();
    // Broadcast status to all clients
    const statusMsg = JSON.stringify({
        type: 'status',
        ...clusterStatus
    });
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(statusMsg);
        }
    });
}, 2000);

// WebSocket handlers
wss.on('connection', (ws) => {
    console.log('[Gateway] New client connected');
    connectedClients.add(ws);

    // Send initial status
    ws.send(JSON.stringify({
        type: 'status',
        ...clusterStatus
    }));

    ws.on('message', async (data) => {
        try {
            const msg = JSON.parse(data);

            if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
                return;
            }

            // Ensure we have a leader
            if (!currentLeader && msg.type === 'draw') {
                const found = await discoverLeader();
                if (!found) {
                    console.log('[Gateway] No leader available');
                    return;
                }
            }

            if (msg.type === 'draw' && currentLeader) {
                try {
                    // Send to leader
                    const response = await axios.post(
                        `http://${currentLeader.host}:${currentLeader.port}/append-stroke`,
                        msg,
                        { timeout: 2000 }
                    );

                    if (response.status === 200) {
                        // Broadcast to all clients
                        const broadcastMsg = JSON.stringify({
                            type: 'draw',
                            fromX: msg.fromX,
                            fromY: msg.fromY,
                            toX: msg.toX,
                            toY: msg.toY,
                            color: msg.color,
                            size: msg.size
                        });

                        connectedClients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(broadcastMsg);
                            }
                        });
                    }
                } catch (e) {
                    console.error('[Gateway] Failed to append stroke:', e.message);
                    // Try to find new leader
                    await discoverLeader();
                }
            } else if (msg.type === 'clear') {
                const broadcastMsg = JSON.stringify({ type: 'clear' });
                connectedClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastMsg);
                    }
                });
            } else if (msg.type === 'undo') {
                const broadcastMsg = JSON.stringify({ type: 'undo' });
                connectedClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(broadcastMsg);
                    }
                });
            }
        } catch (e) {
            console.error('[Gateway] Error processing message:', e.message);
        }
    });

    ws.on('close', () => {
        connectedClients.delete(ws);
        console.log('[Gateway] Client disconnected');
    });

    ws.on('error', (error) => {
        console.error('[Gateway] WebSocket error:', error.message);
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Gateway] Server listening on port ${PORT}`);
    console.log(`[Gateway] Monitoring replicas: ${REPLICA_HOSTS.map(r => `${r.host}:${r.port}`).join(', ')}`);
    discoverLeader();
});
