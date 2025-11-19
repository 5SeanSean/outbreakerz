const canvas = document.getElementById('gameCanvas');
const game = new GameEngine(canvas, 'singleplayer');

// UI update function for singleplayer
window.updateGameUI = (kills, wave, cash, health, players, currentWeapon) => {
    // Update top bar stats
    document.getElementById('kills').textContent = kills;
    document.getElementById('wave').textContent = wave;
    document.getElementById('cash').textContent = cash;
    document.getElementById('health').textContent = health;

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
};

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

game.start();