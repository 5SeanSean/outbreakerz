document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new GameEngine(canvas, 'multiplayer');

    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room') || localStorage.getItem('roomCode');

    // Connect to your Oracle Cloud server
    const socket = io('http://163.192.106.72:3000');

    socket.on('connect', () => {
        console.log('Connected to server');
        game.setupMultiplayer(socket, socket.id);
        socket.emit('join-room', roomCode, 'Player' + Math.floor(Math.random() * 1000));
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    window.updateGameUI = (score, targetsCollected, players) => {
        document.getElementById('score').textContent = score;
        document.getElementById('targets').textContent = targetsCollected;
        document.getElementById('playerCount').textContent = players.length;
        document.getElementById('roomCodeDisplay').textContent = roomCode;
        
        const playersList = document.getElementById('playersList');
        playersList.innerHTML = '';
        players.forEach(player => {
            const playerElement = document.createElement('div');
            playerElement.className = 'player-item';
            playerElement.innerHTML = `
                <span class="player-color" style="background-color: ${player.color}"></span>
                ${player.name}
            `;
            playersList.appendChild(playerElement);
        });
    };

    game.start();

    window.leaveRoom = () => {
        if (confirm('Are you sure you want to leave the room?')) {
            socket.disconnect();
            window.location.href = 'multiplayer.html';
        }
    };
});