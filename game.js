console.log('🚀 game.js STARTED LOADING');

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
console.log('🎯 Canvas context:', ctx);

// Get room code
const urlParams = new URLSearchParams(window.location.search);
const roomCode = urlParams.get('room');
console.log('🔑 Room code from URL:', roomCode);

// Socket.io
console.log('🔌 Connecting socket...');
const socket = io();

socket.on('connect', () => {
    console.log('✅ SOCKET CONNECTED, ID:', socket.id);
    console.log('📤 Emitting join-room for:', roomCode);
    socket.emit('join-room', roomCode, 'TestPlayer');
});

socket.on('game-state', (data) => {
    console.log('🎮 GAME STATE RECEIVED:', data);
    console.log('Players:', data.players);
    console.log('Targets:', data.targets);
});

socket.on('player-joined', (player) => {
    console.log('👤 PLAYER JOINED:', player);
});

// Draw something immediately to test if canvas works
ctx.fillStyle = 'red';
ctx.fillRect(50, 50, 100, 100);
ctx.fillStyle = 'white';
ctx.font = '20px Arial';
ctx.fillText('TEST - Canvas is working', 60, 80);

console.log('🚀 game.js FINISHED LOADING');