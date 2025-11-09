const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const targetsElement = document.getElementById('targets');

// Player properties
const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 20,
    speed: 5,
    color: '#4FC3F7',
    borderColor: '#0288D1'
};

// Target properties
const targets = [];
const targetCount = 5;
let score = 0;
let targetsCollected = 0;

// Create initial targets
function createTargets() {
    targets.length = 0;
    for (let i = 0; i < targetCount; i++) {
        targets.push({
            x: Math.random() * (canvas.width - 40) + 20,
            y: Math.random() * (canvas.height - 40) + 20,
            radius: 15,
            color: '#FF5252',
            borderColor: '#D32F2F'
        });
    }
}

// Input handling
const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});

// Movement handling
function handleMovement() {
    if (keys['arrowup'] || keys['w']) {
        player.y = Math.max(player.radius, player.y - player.speed);
    }
    if (keys['arrowdown'] || keys['s']) {
        player.y = Math.min(canvas.height - player.radius, player.y + player.speed);
    }
    if (keys['arrowleft'] || keys['a']) {
        player.x = Math.max(player.radius, player.x - player.speed);
    }
    if (keys['arrowright'] || keys['d']) {
        player.x = Math.min(canvas.width - player.radius, player.x + player.speed);
    }
}

// Collision detection
function checkCollisions() {
    for (let i = targets.length - 1; i >= 0; i--) {
        const target = targets[i];
        const dx = player.x - target.x;
        const dy = player.y - target.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < player.radius + target.radius) {
            // Collision detected
            targets.splice(i, 1);
            score += 10;
            targetsCollected++;
            
            // Create new target
            targets.push({
                x: Math.random() * (canvas.width - 40) + 20,
                y: Math.random() * (canvas.height - 40) + 20,
                radius: 15,
                color: '#FF5252',
                borderColor: '#D32F2F'
            });

            updateUI();
        }
    }
}

function updateUI() {
    scoreElement.textContent = score;
    targetsElement.textContent = targetsCollected;
}

// Drawing functions
function drawPlayer() {
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.fill();
    ctx.strokeStyle = player.borderColor;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Player face
    ctx.beginPath();
    ctx.arc(player.x - 8, player.y - 8, 4, 0, Math.PI * 2);
    ctx.arc(player.x + 8, player.y - 8, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#1A237E';
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(player.x, player.y + 5, 6, 0, Math.PI);
    ctx.strokeStyle = '#1A237E';
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawTargets() {
    targets.forEach(target => {
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.fillStyle = target.color;
        ctx.fill();
        ctx.strokeStyle = target.borderColor;
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

function drawBackground() {
    // Gradient background
    const gradient = ctx.createRadialGradient(
        canvas.width/2, canvas.height/2, 0,
        canvas.width/2, canvas.height/2, canvas.width/2
    );
    gradient.addColorStop(0, 'rgba(26, 42, 108, 0.3)');
    gradient.addColorStop(1, 'rgba(178, 31, 31, 0.3)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Game loop
function gameLoop() {
    // Clear canvas with background
    drawBackground();
    
    // Update game state
    handleMovement();
    checkCollisions();
    
    // Draw everything
    drawTargets();
    drawPlayer();
    
    requestAnimationFrame(gameLoop);
}

// Initialize game
createTargets();
updateUI();
gameLoop();

// Handle window resize
window.addEventListener('resize', () => {
    canvas.width = Math.min(800, window.innerWidth - 40);
    canvas.height = Math.min(600, window.innerHeight - 200);
    createTargets();
});