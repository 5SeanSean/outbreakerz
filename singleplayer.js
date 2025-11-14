const canvas = document.getElementById('gameCanvas');
const game = new GameEngine(canvas, 'singleplayer');

window.updateGameUI = (score, targetsCollected) => {
    document.getElementById('score').textContent = score;
    document.getElementById('targets').textContent = targetsCollected;
};

game.start();