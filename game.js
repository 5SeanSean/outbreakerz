// game.js - Multiplayer Game Setup
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new GameEngine(canvas, 'multiplayer');

    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room') || localStorage.getItem('roomCode');

    // Connect to server
    const socket = io('http://163.192.106.72:80', {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        
        // Setup multiplayer
        game.setupMultiplayer(socket, socket.id);
        
        // Join room
        const playerName = 'Survivor' + Math.floor(Math.random() * 1000);
        socket.emit('join-room', roomCode, playerName);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Wait for initial game state before starting
    socket.once('game-state', () => {
        console.log('Received initial game state, starting game loop');
        game.start();
    });

    // Expose UI update function
    window.updateGameUI = UIManager.updateGameUI;
});

// Menu functions
window.resumeGame = () => {
    // Handled in game-engine
};

window.returnToMenu = () => {
    if (confirm('Return to main menu?')) {
        window.location.href = 'index.html';
    }
};

window.selectWeapon = (weaponType) => {
    // Handled in game-engine
};