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
const isHost = localStorage.getItem('isHost') === 'true';

// Socket.io connection
const socket = io();

// Game state
let players = new Map();
let targets = [];
let scores = new Map();
let myPlayerId = null;

// Initialize game
function init() {
    if (!roomCode) {
        window.location.href = 'multiplayer.html';
        return;
    }

    roomCodeDisplay.textContent = roomCode;
    
    // Join room
    socket.emit('join-room', roomCode, `Player${Math.floor(Math.random() * 1000)}`);

    // Start game loop
    gameLoop();
}

// Socket event handlers
socket.on('game-state', (gameState) => {
    players = new Map(gameState.players.map(player => [player.id, player]));
    targets = gameState.targets;
    scores = new Map(gameState.scores);
    myPlayerId = socket.id;
    updatePlayersList();
});

socket.on('player-joined', (newPlayer) => {
    players.set(newPlayer.id, newPlayer);
    updatePlayersList();
});

socket.on('player-left', (playerId) => {
    players.delete(playerId);
    scores.delete(playerId);
    updatePlayersList();
});

socket.on('player-moved', (data) => {
    const player = players.get(data.playerId);
    if (player) {
        player.x = data.x;
        player.y = data.y;
    }
});

socket.on('target-collected', (data) => {
    targets[data.targetIndex] = data.newTarget;
    scores.set(data.playerId, data.newScore);
    
    if (data.playerId === myPlayerId) {
        updateUI();
    }
    updatePlayersList();
});

socket.on('player-count', (count) => {
    playerCountElement.textContent = count;
});

// Input handling
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

function handleMovement() {
    const myPlayer = players.get(myPlayerId);
    if (!myPlayer) return;

    let moved = false;
    const speed = 5;

    if (keys['arrowup'] || keys['w']) {
        myPlayer.y = Math.max(myPlayer.radius, myPlayer.y - speed);
        moved = true;
    }
    if (keys['arrowdown'] || keys['s']) {
        myPlayer.y = Math.min(canvas.height - myPlayer.radius, myPlayer.y + speed);
        moved = true;
    }
    if (keys['arrowleft'] || keys['a']) {
        myPlayer.x = Math.max(myPlayer.radius, myPlayer.x - speed);
        moved = true;
    }
    if (keys['arrowright'] || keys['d']) {
        myPlayer.x = Math.min(canvas.width - myPlayer.radius, myPlayer.x + speed);
        moved = true;
    }

    if (moved) {
        socket.emit('player-move', {
            x: myPlayer.x,
            y: myPlayer.y
        });
    }
}

function checkCollisions() {
    const myPlayer = players.get(myPlayerId);
    if (!myPlayer) return;

    targets.forEach((target, index) => {
        const dx = myPlayer.x - target.x;
        const dy = myPlayer.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < myPlayer.radius + target.radius) {
            socket.emit('collect-target', index);
        }
    });
}

function updateUI() {
    const myScore = scores.get(myPlayerId) || 0;
    scoreElement.textContent = myScore;
    targetsElement.textContent = Math.floor(myScore / 10);
}

function updatePlayersList() {
    playersListElement.innerHTML = '';
    players.forEach((player, id) => {
        const score = scores.get(id) || 0;
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.innerHTML = `
            <span style="color: ${player.color}">●</span> 
            ${player.name}: ${score} points
            ${id === myPlayerId ? ' (You)' : ''}
        `;
        playersListElement.appendChild(playerElement);
    });
}

// Drawing functions
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
        ctx.beginPath();
        ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Player name
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(player.name, player.x, player.y - player.radius - 10);

        // Highlight current player
        if (player.id === myPlayerId) {
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
        ctx.fillStyle = target.color;
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Target cross
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

function gameLoop() {
    drawBackground();
    handleMovement();
    checkCollisions();
    drawTargets();
    drawPlayers();
    requestAnimationFrame(gameLoop);
}

function leaveRoom() {
    socket.disconnect();
    window.location.href = 'multiplayer.html';
}

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = Math.min(800, window.innerWidth - 40);
    canvas.height = Math.min(600, window.innerHeight - 200);
});

// Initialize when page loads
window.addEventListener('load', init);