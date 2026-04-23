const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('statusText');
const colorPicker = document.getElementById('colorPicker');
const brushSize = document.getElementById('brushSize');
const sizeDisplay = document.getElementById('sizeDisplay');

let isDrawing = false;
let lastX = 0;
let lastY = 0;
let socket = null;
let strokeCount = 0;
let localStrokes = [];
let latencyStart = 0;

// Resize canvas to fit container
function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Draw functions
function drawLine(fromX, fromY, toX, toY, color, size) {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    localStrokes = [];
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'clear'
        }));
    }
}

function undoStroke() {
    if (localStrokes.length === 0) return;
    localStrokes.pop();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    redrawCanvas();
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'undo'
        }));
    }
}

function redrawCanvas() {
    localStrokes.forEach(stroke => {
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
    });
}

// Canvas events
canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;
    isDrawing = true;

    localStrokes.push({
        points: [{ x: lastX, y: lastY }],
        color: colorPicker.value,
        size: parseInt(brushSize.value)
    });
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const stroke = localStrokes[localStrokes.length - 1];
    stroke.points.push({ x, y });

    drawLine(lastX, lastY, x, y, colorPicker.value, parseInt(brushSize.value));

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'draw',
            fromX: lastX,
            fromY: lastY,
            toX: x,
            toY: y,
            color: colorPicker.value,
            size: parseInt(brushSize.value)
        }));
    }

    lastX = x;
    lastY = y;
});

canvas.addEventListener('mouseup', () => {
    isDrawing = false;
});

canvas.addEventListener('mouseleave', () => {
    isDrawing = false;
});

// Brush size display
brushSize.addEventListener('input', (e) => {
    sizeDisplay.textContent = e.target.value + 'px';
});

// WebSocket connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to gateway on port 3000
    const wsUrl = `${protocol}//localhost:3000`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        updateStatus(true);
        console.log('Connected to gateway');
    };

    socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'draw') {
            drawLine(msg.fromX, msg.fromY, msg.toX, msg.toY, msg.color, msg.size);
            strokeCount++;
            document.getElementById('strokeCount').textContent = strokeCount;
        } else if (msg.type === 'clear') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            strokeCount = 0;
            localStrokes = [];
            document.getElementById('strokeCount').textContent = '0';
        } else if (msg.type === 'undo') {
            if (localStrokes.length > 0) {
                localStrokes.pop();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                redrawCanvas();
            }
            strokeCount = Math.max(0, strokeCount - 1);
            document.getElementById('strokeCount').textContent = strokeCount;
        } else if (msg.type === 'status') {
            updateClusterStatus(msg);
        } else if (msg.type === 'pong') {
            const latency = Date.now() - latencyStart;
            document.getElementById('latency').textContent = latency + 'ms';
        }
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateStatus(false);
    };

    socket.onclose = () => {
        updateStatus(false);
        setTimeout(connectWebSocket, 3000);
    };
}

function updateStatus(connected) {
    if (connected) {
        statusEl.classList.add('connected');
        statusEl.classList.remove('disconnected');
        statusText.textContent = '✓ Connected to Gateway';
        document.getElementById('gatewayStatus').textContent = 'Online';
    } else {
        statusEl.classList.add('disconnected');
        statusEl.classList.remove('connected');
        statusText.textContent = '✗ Disconnected - Reconnecting...';
        document.getElementById('gatewayStatus').textContent = 'Offline';
    }
}

function updateClusterStatus(status) {
    if (status.leader) {
        document.getElementById('leaderInfo').textContent = `Replica ${status.leader}`;
    }
    if (status.term !== undefined) {
        document.getElementById('termInfo').textContent = status.term;
    }
    if (status.replicas !== undefined) {
        document.getElementById('replicaCount').textContent = `${status.replicas}/3`;
    }
    if (status.logSize !== undefined) {
        document.getElementById('logSize').textContent = status.logSize;
    }
}

// Periodic ping for latency measurement
setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        latencyStart = Date.now();
        socket.send(JSON.stringify({ type: 'ping' }));
    }
}, 5000);

// Connect on load
connectWebSocket();
