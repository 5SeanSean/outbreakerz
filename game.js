const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const targetsElement = document.getElementById('targets');
const playerCountElement = document.getElementById('playerCount');
const playersListElement = document.getElementById('playersList');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');

// Get room code from URL
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room') || localStorage.getItem('roomCode');

// Game state
let players = [];
let targets = [];
let currentPlayerId = null;
let score = 0;
let targetsCollected = 0;

// Socket.io
console.log('🔌 Connecting socket...');
const socket = io('http://' + window.location.host);

socket.on('connect', () => {
    console.log('✅ SOCKET CONNECTED, ID:', socket.id);
    currentPlayerId = socket.id;
    console.log('📤 Emitting join-room for:', roomCode);
    socket.emit('join-room', roomCode, 'Player' + Math.floor(Math.random() * 1000));
});

socket.on('game-state', (data) => {
    console.log('🎮 GAME STATE RECEIVED:', data);
    players = data.players || [];
    targets = data.targets || [];
    console.log('Players:', players);
    console.log('Targets:', targets);
    
    // Update UI
    document.getElementById('playerCount').textContent = players.length;
    document.getElementById('roomCodeDisplay').textContent = roomCode;
    updatePlayersList();
});

socket.on('player-joined', (player) => {
    console.log('👤 PLAYER JOINED:', player);
    // The game-state event will handle the update
});

socket.on('player-moved', (data) => {
    console.log("📥 player-moved received:", data);
    const player = players.find(p => p.id === data.playerId);
    if (player) {
        player.x = data.x;
        player.y = data.y;
        console.log("✅ Updated player position:", player.name, { x: player.x, y: player.y });
    } else {
        console.warn("⚠️ Player not found for player-moved:", data.playerId);
    }
});

socket.on('target-collected', (data) => {
    console.log('🎯 Target collected:', data);
    // Replace the collected target with new one
    if (targets[data.targetIndex]) {
        targets[data.targetIndex] = data.newTarget;
    }
    
    // Update score if it's the current player
    if (data.playerId === currentPlayerId) {
        score = data.newScore;
        targetsCollected = Math.floor(score / 10);
        updateUI();
    }
    
    updatePlayersList();
});

socket.on('player-left', (playerId) => {
    players = players.filter(p => p.id !== playerId);
    document.getElementById('playerCount').textContent = players.length;
    updatePlayersList();
});

socket.on('player-count', (count) => {
    document.getElementById('playerCount').textContent = count;
});

// Input handling
const keys = {};
const playerSpeed = 5;

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Movement handling
function handleMovement() {
    const player = players.find(p => p.id === currentPlayerId);
    if (!player) return;

    let newX = player.x;
    let newY = player.y;

    if (keys['arrowup'] || keys['w']) {
        newY = Math.max(player.radius, player.y - playerSpeed);
    }
    if (keys['arrowdown'] || keys['s']) {
        newY = Math.min(canvas.height - player.radius, player.y + playerSpeed);
    }
    if (keys['arrowleft'] || keys['a']) {
        newX = Math.max(player.radius, player.x - playerSpeed);
    }
    if (keys['arrowright'] || keys['d']) {
        newX = Math.min(canvas.width - player.radius, player.x + playerSpeed);
    }

    // Only send update if position changed
    if (newX !== player.x || newY !== player.y) {
        player.x = newX;
        player.y = newY;
        
        socket.emit('player-move', {
            x: newX,
            y: newY
        });

        // Check collisions locally for immediate feedback
        checkCollisions();
    }
}

// Collision detection
function checkCollisions() {
    const player = players.find(p => p.id === currentPlayerId);
    if (!player) return;

    for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        const dx = player.x - target.x;
        const dy = player.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + target.radius) {
            socket.emit('collect-target', i);
            break; // Only collect one target per frame
        }
    }
}

function updateUI() {
    scoreElement.textContent = score;
    targetsElement.textContent = targetsCollected;
}

// Rendering functions
function drawBackground() {
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 0,
        canvas.width/2, canvas.height/2, canvas.width/2
    );
    gradient.addColorStop(0, 'rgba(26, 42, 108, 0.3)');
    gradient.addColorStop(1, 'rgba(178, 31, 31, 0.3)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPlayers() {
    players.forEach(player => {
        // Draw player circle
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = player.color || '#4FC3F7';
        ctx.fill();
        ctx.strokeStyle = player.borderColor || '#0288D1';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw face (eyes and mouth)
        ctx.beginPath();
        ctx.arc(player.x - 8, player.y - 8, 4, 0, Math.PI * 2);
        ctx.arc(player.x + 8, player.y - 8, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#1A237E';
        ctx.fill();
        
        ctx.beginPath();
        ctx.arc(player.x, player.y + 5, 6, 0, Math.PI);
        ctx.strokeStyle = '#1A237E';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw player name
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x, player.y - player.radius - 10);
        
        // Highlight current player
        if (player.id === currentPlayerId) {
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.radius + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFFF00';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawTargets() {
    targets.forEach(target => {
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.fillStyle = target.color || '#FF5252';
        ctx.fill();
        ctx.strokeStyle = target.borderColor || '#D32F2F';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw cross
        ctx.beginPath();
        ctx.moveTo(target.x - target.radius/2, target.y);
        ctx.lineTo(target.x + target.radius/2, target.y);
        ctx.moveTo(target.x, target.y - target.radius/2);
        ctx.lineTo(target.x, target.y + target.radius/2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

function updatePlayersList() {
    const playersList = document.getElementById('playersList');
    playersList.innerHTML = '';
    
    players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span class="player-color" style="background-color: ${player.color}"></span>
            ${player.name}: ${player.id === currentPlayerId ? score : (player.score || 0)} pts
        `;
        playersList.appendChild(playerElement);
    });
}

// Game loop
function gameLoop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw everything
    drawBackground();
    handleMovement();
    drawTargets();
    drawPlayers();
    
    requestAnimationFrame(gameLoop);
}

// Start the game loop
gameLoop();

// Utility functions
function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        socket.disconnect();
        window.location.href = 'multiplayer.html';
    }
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = Math.min(800, window.innerWidth - 40);
    canvas.height = Math.min(600, window.innerHeight - 200);
});