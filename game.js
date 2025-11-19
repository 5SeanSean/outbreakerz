document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new GameEngine(canvas, 'multiplayer');

    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room') || localStorage.getItem('roomCode');

    // Connect to server
    const socket = io('http://163.192.106.72:80');

    socket.on('connect', () => {
        console.log('Connected to server');
        game.setupMultiplayer(socket, socket.id);
        socket.emit('join-room', roomCode, 'Survivor' + Math.floor(Math.random() * 1000));
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    // Updated UI update function
    window.updateGameUI = (kills, wave, cash, health, players, currentWeapon) => {
        // Update top bar stats
        document.getElementById('kills').textContent = kills;
        document.getElementById('wave').textContent = wave;
        document.getElementById('cash').textContent = cash;
        document.getElementById('health').textContent = health;
        document.getElementById('roomCode').textContent = roomCode;

        // Update weapon buttons
        document.querySelectorAll('.weapon-btn').forEach(btn => {
            btn.classList.remove('active', 'disabled');
        });

        const pistolBtn = document.getElementById('pistolBtn');
        const shotgunBtn = document.getElementById('shotgunBtn');
        const rifleBtn = document.getElementById('rifleBtn');

        if (currentWeapon === 'pistol') pistolBtn.classList.add('active');
        if (currentWeapon === 'shotgun') shotgunBtn.classList.add('active');
        if (currentWeapon === 'rifle') rifleBtn.classList.add('active');

        // Disable weapons that can't be afforded
        if (cash < 1000) shotgunBtn.classList.add('disabled');
        if (cash < 2000) rifleBtn.classList.add('disabled');

        // Update players panel for multiplayer
        const playersPanel = document.getElementById('playersPanel');
        const playersList = document.getElementById('playersList');
        const playerCount = document.getElementById('playerCount');

        if (players.length > 1) {
            playersPanel.style.display = 'block';
            playerCount.textContent = players.length;
            
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
        } else {
            playersPanel.style.display = 'none';
        }
    };

    game.start();
});

// ESC Menu functions
window.resumeGame = () => {
    // Handled in game-engine
};

window.returnToMenu = () => {
    if (confirm('Are you sure you want to return to the menu?')) {
        window.location.href = 'index.html';
    }
};

// Weapon selection
window.selectWeapon = (weaponType) => {
    // Handled in game-engine
};