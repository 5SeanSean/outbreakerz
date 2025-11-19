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
        document.getElementById('kills').textContent = kills;
        document.getElementById('waveDisplay').textContent = wave;
        document.getElementById('cash').textContent = cash;
        document.getElementById('health').textContent = health;
        document.getElementById('playerCount').textContent = players.length;
        document.getElementById('roomCodeDisplay').textContent = roomCode;
        
        const playersList = document.getElementById('playersList');
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

        // Show/hide buy menu based on game state
        const buyMenu = document.getElementById('buyMenu');
        const gameState = game.gameState;
        if (gameState === 'buy') {
            buyMenu.style.display = 'block';
            document.getElementById('buyTimer').textContent = Math.ceil(game.waveTimer);
        } else {
            buyMenu.style.display = 'none';
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