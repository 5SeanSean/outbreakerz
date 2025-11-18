class GameEngine {
    constructor(canvas, mode = 'singleplayer') {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mode = mode;
        this.players = [];
        this.zombies = [];
        this.bullets = [];
        this.wave = 1;
        this.zombiesKilled = 0;
        this.cash = 500; // Starting cash
        this.gameState = 'buy'; // 'buy' or 'fight'
        this.waveTimer = 0;
        this.buyTime = 30; // 30 seconds buy phase
        this.keys = {};
        this.socket = null;
        this.currentPlayerId = null;
        this.weapons = {
            pistol: { damage: 25, fireRate: 500, ammo: 12, maxAmmo: 12, reloadTime: 1500, cost: 0 },
            shotgun: { damage: 40, fireRate: 800, ammo: 6, maxAmmo: 6, reloadTime: 2000, cost: 1000 },
            rifle: { damage: 35, fireRate: 300, ammo: 30, maxAmmo: 30, reloadTime: 2500, cost: 2000 }
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.currentWeapon = 'pistol';
        this.lastShot = 0;
        this.isReloading = false;
    }

    setupSinglePlayer() {
        this.players.push({
            id: 'player1',
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            radius: 20,
            speed: 5,
            color: '#4FC3F7',
            health: 100,
            maxHealth: 100,
            weapon: 'pistol',
            ammo: this.weapons.pistol.ammo,
            name: 'Survivor'
        });
        this.currentPlayerId = 'player1';
        this.startBuyPhase();
    }

    setupMultiplayer(socket, playerId) {
        this.socket = socket;
        this.currentPlayerId = playerId;
        
        socket.on('game-state', (data) => {
            this.players = data.players || [];
            this.zombies = data.zombies || [];
            this.bullets = data.bullets || [];
            this.wave = data.wave || 1;
            this.gameState = data.gameState || 'buy';
            this.waveTimer = data.waveTimer || 0;
            this.cash = data.cash || 500;
        });

        socket.on('zombie-killed', (data) => {
            this.zombies = this.zombies.filter(z => z.id !== data.zombieId);
            if (data.playerId === this.currentPlayerId) {
                this.cash += 25; // Cash reward
            }
        });

        socket.on('player-hit', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.health = data.newHealth;
            }
        });
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            // Reload with R key
            if (e.key === 'r' && !this.isReloading) {
                this.reload();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('click', (e) => {
            if (this.gameState === 'fight' && !this.isReloading) {
                this.shoot(e);
            }
        });

        // Buy weapon events
        window.buyWeapon = (weaponType) => {
            if (this.gameState === 'buy') {
                this.purchaseWeapon(weaponType);
            }
        };
    }

    startBuyPhase() {
        this.gameState = 'buy';
        this.waveTimer = this.buyTime;
        this.zombies = [];
        this.bullets = [];
        
        // Reset player position to center
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (player) {
            player.x = this.canvas.width / 2;
            player.y = this.canvas.height / 2;
            player.health = player.maxHealth; // Heal between rounds
        }
    }

    startFightPhase() {
        this.gameState = 'fight';
        this.spawnZombieWave();
    }

    spawnZombieWave() {
        const zombieCount = 5 + (this.wave * 2);
        this.zombies = [];
        
        for (let i = 0; i < zombieCount; i++) {
            this.zombies.push(this.generateZombie());
        }
    }

    generateZombie() {
        // Spawn zombies from edges
        const side = Math.floor(Math.random() * 4);
        let x, y;
        
        switch(side) {
            case 0: // top
                x = Math.random() * this.canvas.width;
                y = -50;
                break;
            case 1: // right
                x = this.canvas.width + 50;
                y = Math.random() * this.canvas.height;
                break;
            case 2: // bottom
                x = Math.random() * this.canvas.width;
                y = this.canvas.height + 50;
                break;
            case 3: // left
                x = -50;
                y = Math.random() * this.canvas.height;
                break;
        }
        
        return {
            id: Math.random().toString(36).substr(2, 9),
            x: x,
            y: y,
            radius: 25,
            speed: 1 + (this.wave * 0.1),
            health: 50 + (this.wave * 10),
            maxHealth: 50 + (this.wave * 10),
            color: '#4CAF50',
            borderColor: '#2E7D32',
            damage: 20
        };
    }

    handleMovement() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player || this.isReloading) return;

        let newX = player.x;
        let newY = player.y;

        if (this.keys['w']) newY = Math.max(player.radius, player.y - player.speed);
        if (this.keys['s']) newY = Math.min(this.canvas.height - player.radius, player.y + player.speed);
        if (this.keys['a']) newX = Math.max(player.radius, player.x - player.speed);
        if (this.keys['d']) newX = Math.min(this.canvas.width - player.radius, player.x + player.speed);

        if (newX !== player.x || newY !== player.y) {
            player.x = newX;
            player.y = newY;

            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('player-move', { x: newX, y: newY });
            }
        }
    }

    updateZombies() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;

        this.zombies.forEach(zombie => {
            // Move towards player
            const dx = player.x - zombie.x;
            const dy = player.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                zombie.x += (dx / distance) * zombie.speed;
                zombie.y += (dy / distance) * zombie.speed;
            }

            // Check collision with player
            if (distance < player.radius + zombie.radius) {
                this.playerTakeDamage(zombie.damage);
            }
        });
    }

    updateBullets() {
        this.bullets.forEach((bullet, bulletIndex) => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            
            // Remove bullets that are off screen
            if (bullet.x < 0 || bullet.x > this.canvas.width || 
                bullet.y < 0 || bullet.y > this.canvas.height) {
                this.bullets.splice(bulletIndex, 1);
                return;
            }
            
            // Check bullet-zombie collisions
            this.zombies.forEach((zombie, zombieIndex) => {
                const dx = bullet.x - zombie.x;
                const dy = bullet.y - zombie.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < zombie.radius) {
                    zombie.health -= bullet.damage;
                    this.bullets.splice(bulletIndex, 1);
                    
                    if (zombie.health <= 0) {
                        this.zombies.splice(zombieIndex, 1);
                        this.zombiesKilled++;
                        this.cash += 25;
                        
                        if (this.mode === 'multiplayer' && this.socket) {
                            this.socket.emit('zombie-killed', { zombieId: zombie.id });
                        }
                    }
                    
                    if (this.mode === 'multiplayer' && this.socket) {
                        this.socket.emit('zombie-damaged', { 
                            zombieId: zombie.id, 
                            damage: bullet.damage 
                        });
                    }
                }
            });
        });
    }

    shoot(e) {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player || this.isReloading) return;
        
        const weapon = this.weapons[this.currentWeapon];
        const now = Date.now();
        
        if (now - this.lastShot < weapon.fireRate) return;
        if (weapon.ammo <= 0) {
            this.reload();
            return;
        }
        
        // Calculate direction
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
        
        // Create bullet
        const bullet = {
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            damage: weapon.damage,
            radius: 3,
            color: '#FFD700'
        };
        
        this.bullets.push(bullet);
        weapon.ammo--;
        this.lastShot = now;
        
        if (this.mode === 'multiplayer' && this.socket) {
            this.socket.emit('player-shoot', bullet);
        }
    }

    reload() {
        const weapon = this.weapons[this.currentWeapon];
        if (weapon.ammo === weapon.maxAmmo) return;
        
        this.isReloading = true;
        setTimeout(() => {
            weapon.ammo = weapon.maxAmmo;
            this.isReloading = false;
        }, weapon.reloadTime);
    }

    purchaseWeapon(weaponType) {
        const weapon = this.weapons[weaponType];
        if (this.cash >= weapon.cost) {
            this.cash -= weapon.cost;
            this.currentWeapon = weaponType;
            
            const player = this.players.find(p => p.id === this.currentPlayerId);
            if (player) {
                player.weapon = weaponType;
            }
            
            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('weapon-purchase', weaponType);
            }
        }
    }

    playerTakeDamage(damage) {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;
        
        player.health -= damage;
        
        if (player.health <= 0) {
            this.gameOver();
        }
        
        if (this.mode === 'multiplayer' && this.socket) {
            this.socket.emit('player-damage', damage);
        }
    }

    gameOver() {
        alert(`Game Over! You survived ${this.wave} waves and killed ${this.zombiesKilled} zombies.`);
        this.wave = 1;
        this.zombiesKilled = 0;
        this.cash = 500;
        this.startBuyPhase();
    }

    update() {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdate) / 1000;
        this.lastUpdate = now;
        
        if (this.gameState === 'buy') {
            this.waveTimer -= deltaTime;
            if (this.waveTimer <= 0) {
                this.startFightPhase();
            }
        } else if (this.gameState === 'fight') {
            this.handleMovement();
            this.updateZombies();
            this.updateBullets();
            
            // Check if wave is complete
            if (this.zombies.length === 0) {
                this.wave++;
                this.startBuyPhase();
            }
        }
        
        this.updateUI();
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.drawBackground();
        
        // Draw game objects
        this.drawZombies();
        this.drawBullets();
        this.drawPlayers();
        this.drawUI();
    }

    drawBackground() {
        // Dark, apocalyptic background
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Grid pattern for ground
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        for (let x = 0; x < this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = 0; y < this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
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
            
            // Draw health bar
            const healthPercent = player.health / player.maxHealth;
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
            this.ctx.fillRect(player.x - 20, player.y - 35, 40 * healthPercent, 4);
            
            // Draw player name and weapon
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, player.x, player.y - player.radius - 20);
            this.ctx.fillText(player.weapon.toUpperCase(), player.x, player.y - player.radius - 8);
        });
    }

    drawZombies() {
        this.zombies.forEach(zombie => {
            // Draw zombie circle
            this.ctx.beginPath();
            this.ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = zombie.color;
            this.ctx.fill();
            this.ctx.strokeStyle = zombie.borderColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw health bar
            const healthPercent = zombie.health / zombie.maxHealth;
            this.ctx.fillStyle = '#F44336';
            this.ctx.fillRect(zombie.x - 20, zombie.y - 35, 40 * healthPercent, 4);
            
            // Draw zombie face (simple)
            this.ctx.fillStyle = '#1a1a1a';
            this.ctx.beginPath();
            this.ctx.arc(zombie.x - 8, zombie.y - 5, 4, 0, Math.PI * 2);
            this.ctx.arc(zombie.x + 8, zombie.y - 5, 4, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.beginPath();
            this.ctx.arc(zombie.x, zombie.y + 5, 6, 0, Math.PI);
            this.ctx.stroke();
        });
    }

    drawBullets() {
        this.bullets.forEach(bullet => {
            this.ctx.beginPath();
            this.ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = bullet.color;
            this.ctx.fill();
        });
    }

    drawUI() {
        // Wave and game state info
        this.ctx.fillStyle = 'white';
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Wave: ${this.wave}`, 10, 25);
        this.ctx.fillText(`Zombies: ${this.zombies.length}`, 10, 45);
        
        // Game state and timer
        if (this.gameState === 'buy') {
            this.ctx.fillStyle = '#4FC3F7';
            this.ctx.fillText(`BUY PHASE: ${Math.ceil(this.waveTimer)}s`, 10, 65);
        } else {
            this.ctx.fillStyle = '#FF5252';
            this.ctx.fillText('FIGHT!', 10, 65);
        }
        
        // Weapon and ammo info
        const weapon = this.weapons[this.currentWeapon];
        this.ctx.fillText(`Weapon: ${this.currentWeapon.toUpperCase()}`, this.canvas.width - 150, 25);
        this.ctx.fillText(`Ammo: ${weapon.ammo}/${weapon.maxAmmo}`, this.canvas.width - 150, 45);
        if (this.isReloading) {
            this.ctx.fillStyle = '#FFD740';
            this.ctx.fillText('RELOADING...', this.canvas.width - 150, 65);
        }
        
        // Cash
        this.ctx.fillStyle = '#69F0AE';
        this.ctx.fillText(`Cash: $${this.cash}`, this.canvas.width - 150, 85);
    }

    updateUI() {
        if (typeof window.updateGameUI === 'function') {
            const player = this.players.find(p => p.id === this.currentPlayerId);
            window.updateGameUI(
                this.zombiesKilled,
                this.wave,
                this.cash,
                player ? player.health : 100,
                this.players
            );
        }
    }

    gameLoop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.gameLoop());
    }

    start() {
        if (this.mode === 'singleplayer') {
            this.setupSinglePlayer();
        }
        this.lastUpdate = Date.now();
        this.gameLoop();
    }
}