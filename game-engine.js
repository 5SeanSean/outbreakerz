// game-engine.js - Core Game Engine
class GameEngine {
    constructor(canvas, mode = 'singleplayer') {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mode = mode;
        
        // Core systems
        this.playerManager = new PlayerManager();
        this.zombieManager = new ZombieManager();
        this.bulletManager = new BulletManager();
        this.uiManager = new UIManager();
        this.inputManager = new InputManager();
        
        // Game state
        this.gameState = {
            wave: 1,
            zombiesKilled: 0,
            cash: 500,
            isPaused: false,
            gameStarted: false
        };
        
        this.currentWeapon = 'pistol';
        this.socket = null;
        this.currentPlayerId = null;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        
        if (this.mode === 'singleplayer') {
            this.setupSinglePlayer();
        }
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
    }

    setupSinglePlayer() {
        const player = this.playerManager.createPlayer({
            id: 'player1',
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            name: 'Survivor'
        });
        this.currentPlayerId = player.id;
        this.zombieManager.spawnWave(this.gameState.wave, this.canvas);
    }

    setupMultiplayer(socket, playerId) {
        this.socket = socket;
        this.currentPlayerId = playerId;
        this.setupSocketEvents();
    }

    setupSocketEvents() {
        this.socket.on('game-state', (data) => this.handleGameState(data));
        this.socket.on('zombie-damaged', (data) => this.zombieManager.updateZombieHealth(data));
        this.socket.on('zombie-killed', (data) => this.handleZombieKilled(data));
        this.socket.on('player-joined', (data) => this.playerManager.addPlayer(data));
        this.socket.on('player-left', (id) => this.playerManager.removePlayer(id));
        this.socket.on('player-update', (data) => this.playerManager.updatePlayer(data));
        this.socket.on('bullet-created', (data) => this.bulletManager.addBullet(data));
    }

    handleGameState(data) {
        if (data.players) {
            this.playerManager.syncPlayers(data.players, this.currentPlayerId);
            
            // Update local player stats
            const localPlayer = this.playerManager.getPlayer(this.currentPlayerId);
            if (localPlayer) {
                this.gameState.cash = localPlayer.cash;
                this.currentWeapon = localPlayer.weapon;
            }
        }
        
        if (data.zombies) {
            this.zombieManager.syncZombies(data.zombies);
        }
        
        this.gameState.wave = data.wave || 1;
    }

    handleZombieKilled(data) {
        this.zombieManager.removeZombie(data.zombieId);
        
        if (data.shooterId === this.currentPlayerId) {
            this.gameState.zombiesKilled++;
            this.gameState.cash += 25;
            
            const player = this.playerManager.getPlayer(this.currentPlayerId);
            if (player) {
                player.cash = this.gameState.cash;
            }
        }
    }

    update(deltaTime) {
        if (this.gameState.isPaused) return;

        this.inputManager.handleMovement(this.playerManager, this.currentPlayerId, this.socket, this.mode);
        this.zombieManager.update(this.playerManager, this.currentPlayerId, this.mode);
        this.bulletManager.update(this.zombieManager, this.playerManager, this.currentPlayerId, this.socket, this.mode);
        
        this.updateUI();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const camera = this.playerManager.getCamera(this.currentPlayerId, this.canvas);
        this.ctx.save();
        this.ctx.translate(-camera.x, -camera.y);
        
        this.drawBackground(camera);
        this.zombieManager.draw(this.ctx);
        this.bulletManager.draw(this.ctx);
        this.playerManager.draw(this.ctx);
        
        this.ctx.restore();
    }

    drawBackground(camera) {
        // Background rendering code...
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(camera.x, camera.y, this.canvas.width, this.canvas.height);
        
        // Grid rendering...
    }

    updateUI() {
        const player = this.playerManager.getPlayer(this.currentPlayerId);
        if (player && typeof window.updateGameUI === 'function') {
            window.updateGameUI(
                this.gameState.zombiesKilled,
                this.gameState.wave,
                this.gameState.cash,
                player.health,
                this.playerManager.getPlayers(),
                this.currentWeapon
            );
        }
    }

    gameLoop(currentTime) {
        const deltaTime = currentTime - (this.lastFrameTime || currentTime);
        this.lastFrameTime = currentTime;
        
        this.update(deltaTime);
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    start() {
        if (!this.gameState.gameStarted) {
            this.gameState.gameStarted = true;
            this.lastFrameTime = performance.now();
            this.gameLoop(this.lastFrameTime);
        }
    }
}

// Player Manager
class PlayerManager {
    constructor() {
        this.players = new Map();
        this.camera = { x: 0, y: 0 };
    }

    createPlayer(data) {
        const player = {
            id: data.id,
            x: data.x,
            y: data.y,
            radius: 20,
            speed: 5,
            color: data.color || this.getRandomColor(),
            health: 100,
            maxHealth: 100,
            weapon: 'pistol',
            cash: 500,
            name: data.name,
            borderColor: this.getBorderColor(data.color)
        };
        
        this.players.set(data.id, player);
        return player;
    }

    getRandomColor() {
        const colors = ['#4FC3F7', '#FF5252', '#69F0AE', '#FFD740', '#E040FB', '#18FFFF'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    getBorderColor(color) {
        const colorMap = {
            '#4FC3F7': '#0288D1',
            '#FF5252': '#C62828',
            '#69F0AE': '#00C853',
            '#FFD740': '#F9A825',
            '#E040FB': '#AA00FF',
            '#18FFFF': '#00B8D4'
        };
        return colorMap[color] || '#000000';
    }

    getPlayer(id) {
        return this.players.get(id);
    }

    getPlayers() {
        return Array.from(this.players.values());
    }

    addPlayer(data) {
        if (!this.players.has(data.id)) {
            this.createPlayer(data);
        }
    }

    removePlayer(id) {
        this.players.delete(id);
    }

    updatePlayer(data) {
        const player = this.players.get(data.playerId);
        if (player && data.playerId !== this.currentPlayerId) {
            Object.assign(player, data);
        }
    }

    syncPlayers(serverPlayers, currentPlayerId) {
        const newPlayers = new Map();
        
        serverPlayers.forEach(serverPlayer => {
            const existing = this.players.get(serverPlayer.id);
            if (existing) {
                // Update stats but keep position for local player
                if (serverPlayer.id === currentPlayerId) {
                    Object.assign(existing, {
                        health: serverPlayer.health,
                        weapon: serverPlayer.weapon,
                        cash: serverPlayer.cash,
                        color: serverPlayer.color,
                        name: serverPlayer.name
                    });
                } else {
                    Object.assign(existing, serverPlayer);
                }
            } else {
                this.createPlayer(serverPlayer);
            }
            newPlayers.set(serverPlayer.id, serverPlayer);
        });
        
        // Remove players not in server data
        this.players.forEach((player, id) => {
            if (!newPlayers.has(id)) {
                this.players.delete(id);
            }
        });
    }

    getCamera(playerId, canvas) {
        const player = this.getPlayer(playerId);
        if (player) {
            this.camera.x = player.x - canvas.width / 2;
            this.camera.y = player.y - canvas.height / 2;
        }
        return this.camera;
    }

    draw(ctx) {
        this.players.forEach(player => {
            // Draw player circle
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            ctx.fillStyle = player.color;
            ctx.fill();
            ctx.strokeStyle = player.borderColor;
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // Draw health bar
            const healthPercent = player.health / player.maxHealth;
            ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
            ctx.fillRect(player.x - 20, player.y - 35, 40 * healthPercent, 4);
            
            // Draw name and weapon
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(player.name, player.x, player.y - player.radius - 20);
            ctx.font = '10px Arial';
            ctx.fillText(player.weapon.toUpperCase(), player.x, player.y - player.radius - 8);
        });
    }
}

// Zombie Manager
class ZombieManager {
    constructor() {
        this.zombies = new Map();
    }

    spawnWave(wave, canvas) {
        const zombieCount = 5 + (wave * 2);
        this.zombies.clear();
        
        for (let i = 0; i < zombieCount; i++) {
            this.createZombie(wave, canvas);
        }
    }

    createZombie(wave, canvas) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        
        switch(side) {
            case 0: x = Math.random() * canvas.width; y = -50; break;
            case 1: x = canvas.width + 50; y = Math.random() * canvas.height; break;
            case 2: x = Math.random() * canvas.width; y = canvas.height + 50; break;
            case 3: x = -50; y = Math.random() * canvas.height; break;
        }
        
        const zombie = {
            id: Math.random().toString(36).substr(2, 9),
            x: x, y: y,
            targetX: x, targetY: y,
            radius: 25,
            speed: 1 + (wave * 0.1),
            health: 50 + (wave * 10),
            maxHealth: 50 + (wave * 10),
            color: '#4CAF50',
            borderColor: '#2E7D32',
            damage: 20
        };
        
        this.zombies.set(zombie.id, zombie);
        return zombie;
    }

    update(playerManager, currentPlayerId, mode) {
        const player = playerManager.getPlayer(currentPlayerId);
        if (!player) return;

        this.zombies.forEach(zombie => {
            if (mode === 'multiplayer') {
                // Client-side interpolation
                const lerpFactor = 0.3;
                zombie.x += (zombie.targetX - zombie.x) * lerpFactor;
                zombie.y += (zombie.targetY - zombie.y) * lerpFactor;
            } else {
                // Singleplayer movement
                const dx = player.x - zombie.x;
                const dy = player.y - zombie.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    zombie.x += (dx / distance) * zombie.speed;
                    zombie.y += (dy / distance) * zombie.speed;
                }
            }

            // Check collision with player
            const dx = player.x - zombie.x;
            const dy = player.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < player.radius + zombie.radius) {
                this.handlePlayerCollision(player, zombie);
            }
        });
    }

    handlePlayerCollision(player, zombie) {
        player.health = Math.max(0, player.health - zombie.damage);
        
        if (player.health <= 0) {
            // Game over handled by main engine
        }
    }

    updateZombieHealth(data) {
        const zombie = this.zombies.get(data.zombieId);
        if (zombie) {
            zombie.health = data.health;
            zombie.maxHealth = data.maxHealth;
        }
    }

    removeZombie(id) {
        this.zombies.delete(id);
    }

    syncZombies(serverZombies) {
        const newZombies = new Map();
        
        serverZombies.forEach(serverZombie => {
            const existing = this.zombies.get(serverZombie.id);
            if (existing) {
                existing.targetX = serverZombie.x;
                existing.targetY = serverZombie.y;
                existing.health = serverZombie.health;
                existing.maxHealth = serverZombie.maxHealth;
            } else {
                this.zombies.set(serverZombie.id, {
                    ...serverZombie,
                    targetX: serverZombie.x,
                    targetY: serverZombie.y
                });
            }
            newZombies.set(serverZombie.id, serverZombie);
        });
        
        // Remove zombies not in server data
        this.zombies.forEach((zombie, id) => {
            if (!newZombies.has(id)) {
                this.zombies.delete(id);
            }
        });
    }

    draw(ctx) {
        this.zombies.forEach(zombie => {
            // Draw zombie body
            ctx.beginPath();
            ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
            ctx.fillStyle = zombie.color;
            ctx.fill();
            ctx.strokeStyle = zombie.borderColor;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw health bar
            const healthPercent = zombie.health / zombie.maxHealth;
            ctx.fillStyle = '#F44336';
            ctx.fillRect(zombie.x - 20, zombie.y - 35, 40 * healthPercent, 4);
            
            // Draw zombie face
            ctx.fillStyle = '#1a1a1a';
            ctx.beginPath();
            ctx.arc(zombie.x - 8, zombie.y - 5, 4, 0, Math.PI * 2);
            ctx.arc(zombie.x + 8, zombie.y - 5, 4, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(zombie.x, zombie.y + 5, 6, 0, Math.PI);
            ctx.stroke();
        });
    }
}

// Bullet Manager
class BulletManager {
    constructor() {
        this.bullets = [];
        this.weapons = {
            pistol: { damage: 25, fireRate: 500, ammo: 12, maxAmmo: 12, reloadTime: 1500, cost: 0 },
            shotgun: { damage: 40, fireRate: 800, ammo: 6, maxAmmo: 6, reloadTime: 2000, cost: 1000 },
            rifle: { damage: 35, fireRate: 300, ammo: 30, maxAmmo: 30, reloadTime: 2500, cost: 2000 }
        };
        
        this.lastShot = 0;
        this.isReloading = false;
    }

    createBullet(player, targetX, targetY, weaponType, playerId) {
        const weapon = this.weapons[weaponType];
        const angle = Math.atan2(targetY - player.y, targetX - player.x);
        
        return {
            id: Math.random().toString(36).substr(2, 9),
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            damage: weapon.damage,
            radius: 3,
            color: '#FFD700',
            playerId: playerId
        };
    }

    update(zombieManager, playerManager, currentPlayerId, socket, mode) {
        this.bullets = this.bullets.filter(bullet => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            
            // Remove out-of-bounds bullets
            if (bullet.x < -100 || bullet.x > 10000 || 
                bullet.y < -100 || bullet.y > 10000) {
                return false;
            }
            
            // Check for zombie hits
            let hitZombie = false;
            zombieManager.zombies.forEach(zombie => {
                const dx = bullet.x - zombie.x;
                const dy = bullet.y - zombie.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < zombie.radius && !hitZombie) {
                    hitZombie = true;
                    this.handleZombieHit(bullet, zombie, socket, mode, currentPlayerId);
                }
            });
            
            return !hitZombie;
        });
    }

    handleZombieHit(bullet, zombie, socket, mode, currentPlayerId) {
        if (bullet.playerId === currentPlayerId) {
            if (mode === 'multiplayer' && socket) {
                socket.emit('zombie-hit', {
                    zombieId: zombie.id,
                    damage: bullet.damage,
                    shooterId: currentPlayerId
                });
            } else {
                // Singleplayer - handle locally
                zombie.health -= bullet.damage;
                
                if (zombie.health <= 0) {
                    zombieManager.removeZombie(zombie.id);
                    // Wave completion handled by main engine
                }
            }
        }
    }

    addBullet(bullet) {
        this.bullets.push(bullet);
    }

    draw(ctx) {
        this.bullets.forEach(bullet => {
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            ctx.fillStyle = bullet.color;
            ctx.fill();
        });
    }
}

// Input Manager
class InputManager {
    constructor() {
        this.keys = new Set();
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.key.toLowerCase());
        });

        window.addEventListener('keyup', (e) => {
            this.keys.delete(e.key.toLowerCase());
        });
    }

    handleMovement(playerManager, currentPlayerId, socket, mode) {
        const player = playerManager.getPlayer(currentPlayerId);
        if (!player) return;

        let moved = false;
        let newX = player.x;
        let newY = player.y;

        if (this.keys.has('w')) { 
            newY = Math.max(player.radius, player.y - player.speed); 
            moved = true; 
        }
        if (this.keys.has('s')) { 
            newY = player.y + player.speed;
            moved = true; 
        }
        if (this.keys.has('a')) { 
            newX = Math.max(player.radius, player.x - player.speed); 
            moved = true; 
        }
        if (this.keys.has('d')) { 
            newX = player.x + player.speed;
            moved = true; 
        }

        if (moved) {
            player.x = newX;
            player.y = newY;

            if (mode === 'multiplayer' && socket) {
                socket.emit('player-move', { 
                    x: newX, 
                    y: newY,
                    health: player.health,
                    weapon: player.weapon
                });
            }
        }
    }
}

// UI Manager
class UIManager {
    static updateGameUI(kills, wave, cash, health, players, currentWeapon) {
        // Update top bar stats
        document.getElementById('kills').textContent = kills;
        document.getElementById('wave').textContent = wave;
        document.getElementById('cash').textContent = cash;
        document.getElementById('health').textContent = health;

        // Update weapon buttons
        document.querySelectorAll('.weapon-btn').forEach(btn => {
            btn.classList.remove('active', 'disabled');
        });

        const weaponBtns = {
            'pistol': document.getElementById('pistolBtn'),
            'shotgun': document.getElementById('shotgunBtn'),
            'rifle': document.getElementById('rifleBtn')
        };

        if (weaponBtns[currentWeapon]) {
            weaponBtns[currentWeapon].classList.add('active');
        }

        // Disable weapons that can't be afforded
        if (cash < 1000) weaponBtns.shotgun.classList.add('disabled');
        if (cash < 2000) weaponBtns.rifle.classList.add('disabled');

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
    }
}