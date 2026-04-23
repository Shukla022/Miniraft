const express = require('express');
const http = require('http');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REPLICA_ID = process.env.REPLICA_ID || '1';
const REPLICA_HOST = process.env.REPLICA_HOST || 'localhost';
const REPLICA_PORT = process.env.REPLICA_PORT || 5001;
const PEERS = (process.env.PEERS || '').split(',').map(p => {
    if (!p.trim()) return null;
    const [host, port] = p.trim().split(':');
    return { id: `${host}:${port}`.replace('replica', '').replace(/:.*/, ''), host, port: parseInt(port) };
}).filter(p => p !== null);

const ELECTION_TIMEOUT_MIN = 500;
const ELECTION_TIMEOUT_MAX = 800;
const HEARTBEAT_INTERVAL = 150;

// RAFT State
class RaftNode {
    constructor() {
        this.term = 0;
        this.votedFor = null;
        this.log = [];
        this.commitIndex = -1;
        this.lastApplied = -1;

        // Volatile state
        this.state = 'follower'; // follower, candidate, leader
        this.electionTimeout = this.randomElectionTimeout();
        this.lastHeartbeat = Date.now();

        // Leader only
        this.nextIndex = {};
        this.matchIndex = {};
        PEERS.forEach(peer => {
            this.nextIndex[peer.id] = 0;
            this.matchIndex[peer.id] = -1;
        });

        // State machine
        this.strokes = [];

        this.electionTimer = null;
        this.heartbeatTimer = null;

        this.loadPersistentState();
        this.startElectionTimer();
    }

    randomElectionTimeout() {
        return ELECTION_TIMEOUT_MIN + Math.random() * (ELECTION_TIMEOUT_MAX - ELECTION_TIMEOUT_MIN);
    }

    loadPersistentState() {
        const stateFile = '/tmp/raft_state_' + REPLICA_ID + '.json';
        try {
            if (fs.existsSync(stateFile)) {
                const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
                this.term = data.term || 0;
                this.votedFor = data.votedFor || null;
                this.log = data.log || [];
                console.log(`[Replica ${REPLICA_ID}] Loaded state: term=${this.term}, logSize=${this.log.length}`);
            }
        } catch (e) {
            console.log(`[Replica ${REPLICA_ID}] No persistent state found, starting fresh`);
        }
    }

    savePersistentState() {
        const stateFile = '/tmp/raft_state_' + REPLICA_ID + '.json';
        const state = {
            term: this.term,
            votedFor: this.votedFor,
            log: this.log
        };
        fs.writeFileSync(stateFile, JSON.stringify(state));
    }

    startElectionTimer() {
        if (this.electionTimer) clearTimeout(this.electionTimer);
        this.electionTimeout = this.randomElectionTimeout();
        this.electionTimer = setTimeout(() => this.startElection(), this.electionTimeout);
    }

    startHeartbeatTimer() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeats(), HEARTBEAT_INTERVAL);
    }

    clearHeartbeatTimer() {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    }

    async startElection() {
        this.state = 'candidate';
        this.term++;
        this.votedFor = REPLICA_ID;
        this.savePersistentState();

        console.log(`[Replica ${REPLICA_ID}] Election started: term=${this.term}`);

        let votes = 1; // Self vote

        const requests = PEERS.map(peer =>
            axios.post(`http://${peer.host}:${peer.port}/request-vote`, {
                term: this.term,
                candidateId: REPLICA_ID,
                lastLogIndex: this.log.length - 1,
                lastLogTerm: this.log.length > 0 ? this.log[this.log.length - 1].term : 0
            }, { timeout: 1000 })
                .then(res => {
                    if (res.data.voteGranted && this.state === 'candidate') {
                        votes++;
                    }
                    if (res.data.term > this.term) {
                        this.term = res.data.term;
                        this.state = 'follower';
                        this.votedFor = null;
                        this.savePersistentState();
                    }
                })
                .catch(e => {
                    // Peer might be down
                })
        );

        await Promise.all(requests);

        if (this.state === 'candidate' && votes > PEERS.length / 2) {
            this.becomeLeader();
        } else if (this.state === 'candidate') {
            console.log(`[Replica ${REPLICA_ID}] Lost election: only got ${votes}/${PEERS.length + 1} votes`);
            this.state = 'follower';
            this.startElectionTimer();
        }
    }

    becomeLeader() {
        this.state = 'leader';
        console.log(`[Replica ${REPLICA_ID}] *** BECAME LEADER *** (term=${this.term})`);

        // Reset leader state
        PEERS.forEach(peer => {
            this.nextIndex[peer.id] = this.log.length;
            this.matchIndex[peer.id] = -1;
        });

        this.clearHeartbeatTimer();
        this.startHeartbeatTimer();
        this.sendHeartbeats();
    }

    async sendHeartbeats() {
        if (this.state !== 'leader') return;

        const requests = PEERS.map(peer =>
            this.replicateLog(peer)
        );
        await Promise.all(requests);
    }

    async replicateLog(peer) {
        try {
            const prevLogIndex = this.nextIndex[peer.id] - 1;
            const prevLogTerm = prevLogIndex >= 0 && this.log[prevLogIndex] ? this.log[prevLogIndex].term : 0;

            const entries = this.log.slice(this.nextIndex[peer.id]);

            const response = await axios.post(
                `http://${peer.host}:${peer.port}/append-entries`,
                {
                    term: this.term,
                    leaderId: REPLICA_ID,
                    prevLogIndex,
                    prevLogTerm,
                    entries,
                    leaderCommit: this.commitIndex
                },
                { timeout: 1000 }
            );

            if (response.data.term > this.term) {
                this.term = response.data.term;
                this.state = 'follower';
                this.votedFor = null;
                this.clearHeartbeatTimer();
                this.savePersistentState();
                this.startElectionTimer();
                return;
            }

            if (response.data.success) {
                this.matchIndex[peer.id] = prevLogIndex + entries.length;
                this.nextIndex[peer.id] = this.matchIndex[peer.id] + 1;

                // Check if we can commit entries
                this.updateCommitIndex();
            } else {
                // Decrement nextIndex and retry
                if (this.nextIndex[peer.id] > 0) {
                    this.nextIndex[peer.id]--;
                }
            }
        } catch (e) {
            // Peer is down
        }
    }

    updateCommitIndex() {
        let sortedMatches = PEERS.map(peer => this.matchIndex[peer.id]).sort((a, b) => b - a);
        const medianMatch = sortedMatches[Math.floor(PEERS.length / 2)];

        for (let i = this.commitIndex + 1; i <= Math.max(medianMatch, this.commitIndex); i++) {
            if (i < this.log.length && this.log[i].term === this.term) {
                this.commitIndex = i;
                this.applyEntries();
            }
        }
    }

    applyEntries() {
        while (this.lastApplied < this.commitIndex) {
            this.lastApplied++;
            const entry = this.log[this.lastApplied];
            if (entry && entry.type === 'stroke') {
                this.strokes.push(entry.stroke);
            }
        }
    }

    appendEntry(entry) {
        entry.term = this.term;
        entry.index = this.log.length;
        this.log.push(entry);
        this.savePersistentState();

        if (this.state === 'leader') {
            this.updateCommitIndex();
        }
    }

    handleRequestVote(data) {
        if (data.term > this.term) {
            this.term = data.term;
            this.votedFor = null;
            this.state = 'follower';
            this.savePersistentState();
            this.startElectionTimer();
        }

        const logOk = data.lastLogTerm > (this.log.length > 0 ? this.log[this.log.length - 1].term : 0) ||
            (data.lastLogTerm === (this.log.length > 0 ? this.log[this.log.length - 1].term : 0) &&
                data.lastLogIndex >= this.log.length - 1);

        const canVote = data.term >= this.term && logOk && !this.votedFor;

        if (canVote) {
            this.votedFor = data.candidateId;
            this.savePersistentState();
        }

        return {
            term: this.term,
            voteGranted: canVote
        };
    }

    handleAppendEntries(data) {
        if (data.term > this.term) {
            this.term = data.term;
            this.votedFor = null;
            this.savePersistentState();
        }

        this.lastHeartbeat = Date.now();
        this.startElectionTimer();

        if (data.term < this.term) {
            return { success: false, term: this.term };
        }

        // Log matching
        const prevLogTerm = data.prevLogIndex >= 0 && this.log[data.prevLogIndex] ?
            this.log[data.prevLogIndex].term : 0;

        if (data.prevLogIndex >= this.log.length || prevLogTerm !== data.prevLogTerm) {
            return { success: false, term: this.term };
        }

        // Append entries
        this.log = this.log.slice(0, data.prevLogIndex + 1);
        for (const entry of data.entries) {
            this.log.push(entry);
        }
        this.savePersistentState();

        // Update commit index
        if (data.leaderCommit > this.commitIndex) {
            this.commitIndex = Math.min(data.leaderCommit, this.log.length - 1);
            this.applyEntries();
        }

        return { success: true, term: this.term };
    }

    handleSyncLog(fromIndex) {
        // Return all committed entries from fromIndex onward
        return this.log.slice(fromIndex).map(entry => ({
            ...entry,
            committed: this.log.indexOf(entry) <= this.commitIndex
        }));
    }
}

// Express app
const app = express();
app.use(express.json());

const raft = new RaftNode();

// REST Endpoints
app.post('/request-vote', (req, res) => {
    const response = raft.handleRequestVote(req.body);
    res.json(response);
});

app.post('/append-entries', (req, res) => {
    const response = raft.handleAppendEntries(req.body);
    res.json(response);
});

app.get('/sync-log/:fromIndex', (req, res) => {
    const fromIndex = parseInt(req.params.fromIndex) || 0;
    const entries = raft.handleSyncLog(fromIndex);
    res.json({ entries });
});

app.post('/append-stroke', (req, res) => {
    if (raft.state !== 'leader') {
        return res.status(503).json({ error: 'Not leader' });
    }

    raft.appendEntry({
        type: 'stroke',
        stroke: req.body,
        timestamp: Date.now()
    });

    res.json({ success: true });
});

app.get('/status', (req, res) => {
    res.json({
        replicaId: REPLICA_ID,
        isLeader: raft.state === 'leader',
        state: raft.state,
        term: raft.term,
        logSize: raft.log.length,
        commitIndex: raft.commitIndex,
        healthyReplicas: 3,
        strokeCount: raft.strokes.length
    });
});

app.get('/health', (req, res) => {
    res.json({ healthy: true, replica: REPLICA_ID });
});

const server = http.createServer(app);

server.listen(REPLICA_PORT, '0.0.0.0', () => {
    console.log(`[Replica ${REPLICA_ID}] Server listening on port ${REPLICA_PORT}`);
    console.log(`[Replica ${REPLICA_ID}] Peers: ${PEERS.map(p => `${p.host}:${p.port}`).join(', ')}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log(`[Replica ${REPLICA_ID}] Received SIGTERM, shutting down gracefully`);
    raft.savePersistentState();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log(`[Replica ${REPLICA_ID}] Received SIGINT, shutting down gracefully`);
    raft.savePersistentState();
    process.exit(0);
});

module.exports = raft;
