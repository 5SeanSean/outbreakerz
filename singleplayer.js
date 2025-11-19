const canvas = document.getElementById('gameCanvas');
const game = new GameEngine(canvas, 'singleplayer');

window.updateGameUI = (kills, wave, cash, health, players) => {
    document.getElementById('kills').textContent = kills;
    document.getElementById('wave').textContent = wave;
    document.getElementById('cash').textContent = cash;
    document.getElementById('health').textContent = health;

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