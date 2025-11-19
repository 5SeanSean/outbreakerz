document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new GameEngine(canvas, 'multiplayer');

    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room') || localStorage.getItem('roomCode');

    // Connect to your Oracle Cloud server
    const socket = io('http://163.192.106.72:80');

    socket.on('connect', () => {
        console.log('Connected to server');
        game.setupMultiplayer(socket, socket.id);
        socket.emit('join-room', roomCode, 'Survivor' + Math.floor(Math.random() * 1000));
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

// Updated UI update function for zombie game
window.updateGameUI = (kills, wave, cash, health, players) => {
    // Safe element checks
    const killsElement = document.getElementById('kills');
    const waveElement = document.getElementById('waveDisplay');
    const cashElement = document.getElementById('cash');
    const healthElement = document.getElementById('health');
    const playerCountElement = document.getElementById('playerCount');
    const roomCodeElement = document.getElementById('roomCodeDisplay');
    
    if (killsElement) killsElement.textContent = kills;
    if (waveElement) waveElement.textContent = wave;
    if (cashElement) cashElement.textContent = cash;
    if (healthElement) healthElement.textContent = health;
    if (playerCountElement) playerCountElement.textContent = players.length;
    if (roomCodeElement) roomCodeElement.textContent = roomCode;
    
    const playersList = document.getElementById('playersList');
    if (playersList) {
        playersList.innerHTML = '';
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <span class="player-color" style="background-color: ${player.color}"></span>
                ${player.name} (${player.health}HP) - ${player.weapon.toUpperCase()}
            `;
            playersList.appendChild(playerElement);
        });
    }

    // Show/hide buy menu based on game state
    const buyMenu = document.getElementById('buyMenu');
    const buyTimerElement = document.getElementById('buyTimer');
    const gameState = game.gameState;
    
    if (buyMenu && buyTimerElement) {
        if (gameState === 'buy') {
            buyMenu.style.display = 'block';
            buyTimerElement.textContent = Math.ceil(game.waveTimer);
        } else {
            buyMenu.style.display = 'none';
        }
    }
};

    game.start();

    window.leaveRoom = () => {
        if (confirm('Are you sure you want to leave the game?')) {
            socket.disconnect();
            window.location.href = 'multiplayer.html';
        }
    };
});