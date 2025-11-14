class GameEngine {
    constructor(canvas, mode = 'singleplayer') {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mode = mode;
        this.players = [];
        this.targets = [];
        this.score = 0;
        this.targetsCollected = 0;
        this.keys = {};
        this.socket = null;
        this.currentPlayerId = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createTargets(5);
        
        if (this.mode === 'singleplayer') {
            this.setupSinglePlayer();
        }
    }

    setupSinglePlayer() {
        this.players.push({
            id: 'player1',
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: 20,
            speed: 5,
            color: '#4FC3F7',
            borderColor: '#0288D1',
            name: 'Player'
        });
        this.currentPlayerId = 'player1';
    }

    setupMultiplayer(socket, playerId) {
        this.socket = socket;
        this.currentPlayerId = playerId;
        
        // Socket event handlers
        socket.on('game-state', (data) => {
            this.players = data.players || [];
            this.targets = data.targets || [];
        });

        socket.on('player-moved', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        socket.on('target-collected', (data) => {
            if (this.targets[data.targetIndex]) {
                this.targets[data.targetIndex] = data.newTarget;
            }
            if (data.playerId === this.currentPlayerId) {
                this.score = data.newScore;
                this.targetsCollected = Math.floor(this.score / 10);
            }
        });
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });
    }

    createTargets(count) {
        this.targets = [];
        for (let i = 0; i < count; i++) {
            this.targets.push(this.generateTarget());
        }
    }

    generateTarget() {
        return {
            x: Math.random() * (this.canvas.width - 40) + 20,
            y: Math.random() * (this.canvas.height - 40) + 20,
            radius: 15,
            color: '#FF5252',
            borderColor: '#D32F2F'
        };
    }

    handleMovement() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;

        let newX = player.x;
        let newY = player.y;

        if (this.keys['arrowup'] || this.keys['w']) {
            newY = Math.max(player.radius, player.y - player.speed);
        }
        if (this.keys['arrowdown'] || this.keys['s']) {
            newY = Math.min(this.canvas.height - player.radius, player.y + player.speed);
        }
        if (this.keys['arrowleft'] || this.keys['a']) {
            newX = Math.max(player.radius, player.x - player.speed);
        }
        if (this.keys['arrowright'] || this.keys['d']) {
            newX = Math.min(this.canvas.width - player.radius, player.x + player.speed);
        }

        if (newX !== player.x || newY !== player.y) {
            player.x = newX;
            player.y = newY;

            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('player-move', { x: newX, y: newY });
            }

            this.checkCollisions();
        }
    }

    checkCollisions() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;

        for (let i = this.targets.length - 1; i >= 0; i--) {
            const target = this.targets[i];
            const dx = player.x - target.x;
            const dy = player.y - target.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < player.radius + target.radius) {
                if (this.mode === 'multiplayer' && this.socket) {
                    this.socket.emit('collect-target', i);
                } else {
                    this.targets.splice(i, 1);
                    this.score += 10;
                    this.targetsCollected++;
                    this.targets.push(this.generateTarget());
                }
                break;
            }
        }
    }

    drawBackground() {
        const gradient = this.ctx.createRadialGradient(
            this.canvas.width/2, this.canvas.height/2, 0,
            this.canvas.width/2, this.canvas.height/2, this.canvas.width/2
        );
        gradient.addColorStop(0, 'rgba(26, 42, 108, 0.3)');
        gradient.addColorStop(1, 'rgba(178, 31, 31, 0.3)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawPlayers() {
        this.players.forEach(player => {
            // Draw player circle
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = player.color;
            this.ctx.fill();
            this.ctx.strokeStyle = player.borderColor;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            // Draw face
            this.ctx.beginPath();
            this.ctx.arc(player.x - 8, player.y - 8, 4, 0, Math.PI * 2);
            this.ctx.arc(player.x + 8, player.y - 8, 4, 0, Math.PI * 2);
            this.ctx.fillStyle = '#1A237E';
            this.ctx.fill();
            
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y + 5, 6, 0, Math.PI);
            this.ctx.strokeStyle = '#1A237E';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw player name
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, player.x, player.y - player.radius - 10);
        });
    }

    drawTargets() {
        this.targets.forEach(target => {
            this.ctx.beginPath();
            this.ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = target.color;
            this.ctx.fill();
            this.ctx.strokeStyle = target.borderColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw cross
            this.ctx.beginPath();
            this.ctx.moveTo(target.x - target.radius/2, target.y);
            this.ctx.lineTo(target.x + target.radius/2, target.y);
            this.ctx.moveTo(target.x, target.y - target.radius/2);
            this.ctx.lineTo(target.x, target.y + target.radius/2);
            this.ctx.strokeStyle = 'white';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        });
    }

    updateUI() {
        // This will be implemented by the specific page
        if (typeof window.updateGameUI === 'function') {
            window.updateGameUI(this.score, this.targetsCollected, this.players);
        }
    }

    gameLoop() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.handleMovement();
        this.drawTargets();
        this.drawPlayers();
        this.updateUI();
        requestAnimationFrame(() => this.gameLoop());
    }

    start() {
        this.gameLoop();
    }
}