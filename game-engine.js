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
        this.cash = 500;
        this.gameState = 'fight';
        this.keys = {};
        this.socket = null;
        this.currentPlayerId = null;
        this.weapons = {
            pistol: { damage: 25, fireRate: 500, ammo: 12, maxAmmo: 12, reloadTime: 1500, cost: 0 },
            shotgun: { damage: 40, fireRate: 800, ammo: 6, maxAmmo: 6, reloadTime: 2000, cost: 1000 },
            rifle: { damage: 35, fireRate: 300, ammo: 30, maxAmmo: 30, reloadTime: 2500, cost: 2000 }
        };
        
        // Client-side prediction and interpolation
        this.pendingInputs = [];
        this.serverState = {
            players: [],
            zombies: [],
            bullets: []
        };
        this.lastProcessedInput = 0;
        this.inputSequenceNumber = 0;
        
        this.currentWeapon = 'pistol';
        this.lastShot = 0;
        this.isReloading = false;
        this.escMenuOpen = false;
        
        // Fixed timestep for consistent 60Hz
        this.fps = 60;
        this.deltaTime = 1000 / this.fps;
        this.lastFrameTime = 0;
        this.accumulator = 0;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
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
            name: 'Survivor',
            cash: 500
        });
        this.currentPlayerId = 'player1';
        this.spawnZombieWave();
    }

    setupMultiplayer(socket, playerId) {
        this.socket = socket;
        this.currentPlayerId = playerId;
        
        socket.on('game-state', (data) => {
            // Store server state for reconciliation
            this.serverState = {
                players: JSON.parse(JSON.stringify(data.players || [])),
                zombies: JSON.parse(JSON.stringify(data.zombies || [])),
                bullets: JSON.parse(JSON.stringify(data.bullets || []))
            };
            
            // Reconcile player positions
            this.reconcileWithServer();
            
            // Update local state with server data (except current player position)
            this.players = data.players || [];
            this.zombies = data.zombies || [];
            this.bullets = data.bullets || [];
            this.wave = data.wave || 1;
            
            // Update current player's cash and weapon from server data
            const currentPlayer = this.players.find(p => p.id === this.currentPlayerId);
            if (currentPlayer) {
                this.cash = currentPlayer.cash || 500;
                this.currentWeapon = currentPlayer.weapon || 'pistol';
            }
        });

        socket.on('player-moved', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player && player.id !== this.currentPlayerId) {
                player.x = data.x;
                player.y = data.y;
            }
        });

        socket.on('bullet-fired', (bulletData) => {
            if (bulletData.playerId !== this.currentPlayerId) {
                this.bullets.push(bulletData);
            }
        });

        socket.on('zombie-killed', (data) => {
            this.zombies = this.zombies.filter(z => z.id !== data.zombieId);
        });

        socket.on('player-hit', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.health = data.newHealth;
            }
        });

        socket.on('weapon-changed', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.weapon = data.weapon;
            }
        });

        socket.on('player-joined', (playerData) => {
            if (!this.players.find(p => p.id === playerData.id)) {
                this.players.push(playerData);
            }
        });

        socket.on('player-left', (playerId) => {
            this.players = this.players.filter(p => p.id !== playerId);
        });
    }

    reconcileWithServer() {
        const serverPlayer = this.serverState.players.find(p => p.id === this.currentPlayerId);
        const localPlayer = this.players.find(p => p.id === this.currentPlayerId);
        
        if (serverPlayer && localPlayer) {
            // Small correction if we're too far off from server
            const dx = serverPlayer.x - localPlayer.x;
            const dy = serverPlayer.y - localPlayer.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 10) { // Only correct if significantly different
                localPlayer.x = serverPlayer.x;
                localPlayer.y = serverPlayer.y;
                
                // Clear pending inputs since we've been corrected
                this.pendingInputs = [];
            }
        }
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.toggleEscMenu();
                return;
            }
            
            if (this.escMenuOpen) return;
            
            this.keys[e.key.toLowerCase()] = true;
            
            if (e.key === 'r' && !this.isReloading) {
                this.reload();
            }
            
            // Number keys for weapon switching
            if (e.key === '1') this.switchWeapon('pistol');
            if (e.key === '2' && this.cash >= 1000) this.switchWeapon('shotgun');
            if (e.key === '3' && this.cash >= 2000) this.switchWeapon('rifle');
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('click', (e) => {
            if (this.escMenuOpen) return;
            this.shoot(e);
        });

        // Weapon button events
        window.selectWeapon = (weaponType) => {
            if (this.escMenuOpen) return;
            
            const weapon = this.weapons[weaponType];
            if (weaponType === 'pistol' || this.cash >= weapon.cost) {
                this.switchWeapon(weaponType);
            }
        };

        // ESC menu events
        window.resumeGame = () => {
            this.toggleEscMenu();
        };

        window.returnToMenu = () => {
            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.disconnect();
            }
            window.location.href = 'index.html';
        };
    }

    toggleEscMenu() {
        this.escMenuOpen = !this.escMenuOpen;
        const escMenu = document.getElementById('escMenu');
        if (escMenu) {
            escMenu.style.display = this.escMenuOpen ? 'block' : 'none';
        }
    }

    switchWeapon(weaponType) {
        const weapon = this.weapons[weaponType];
        
        if (weaponType !== 'pistol' && this.cash < weapon.cost) {
            return; // Can't afford this weapon
        }
        
        this.currentWeapon = weaponType;
        
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (player) {
            player.weapon = weaponType;
            
            // Deduct cost for non-pistol weapons
            if (weaponType !== 'pistol') {
                this.cash -= weapon.cost;
                player.cash = this.cash;
            }
            
            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('weapon-purchase', weaponType);
            }
        }
        
        this.updateUI();
    }

    processInput() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player || this.isReloading || this.escMenuOpen) return;

        let moved = false;
        let newX = player.x;
        let newY = player.y;

        if (this.keys['w']) { newY = Math.max(player.radius, player.y - player.speed); moved = true; }
        if (this.keys['s']) { newY = Math.min(this.canvas.height - player.radius, player.y + player.speed); moved = true; }
        if (this.keys['a']) { newX = Math.max(player.radius, player.x - player.speed); moved = true; }
        if (this.keys['d']) { newX = Math.min(this.canvas.width - player.radius, player.x + player.speed); moved = true; }

        if (moved) {
            player.x = newX;
            player.y = newY;

            if (this.mode === 'multiplayer' && this.socket) {
                // Store input for reconciliation
                const input = {
                    sequence: this.inputSequenceNumber++,
                    x: newX,
                    y: newY,
                    timestamp: Date.now()
                };
                this.pendingInputs.push(input);
                
                // Send to server
                this.socket.emit('player-move', { 
                    x: newX, 
                    y: newY,
                    sequence: input.sequence 
                });
            }
        }
    }

    spawnZombieWave() {
        const zombieCount = 5 + (this.wave * 2);
        this.zombies = [];
        
        for (let i = 0; i < zombieCount; i++) {
            this.zombies.push(this.generateZombie());
        }
    }

    generateZombie() {
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

    updateZombies() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player) return;

        this.zombies.forEach(zombie => {
            const dx = player.x - zombie.x;
            const dy = player.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance > 0) {
                zombie.x += (dx / distance) * zombie.speed;
                zombie.y += (dy / distance) * zombie.speed;
            }

            if (distance < player.radius + zombie.radius) {
                this.playerTakeDamage(zombie.damage);
            }
        });
    }

    updateBullets() {
        this.bullets.forEach((bullet, bulletIndex) => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            
            if (bullet.x < 0 || bullet.x > this.canvas.width || 
                bullet.y < 0 || bullet.y > this.canvas.height) {
                this.bullets.splice(bulletIndex, 1);
                return;
            }
            
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
                        
                        // Update player cash
                        const player = this.players.find(p => p.id === this.currentPlayerId);
                        if (player) {
                            player.cash = this.cash;
                        }
                        
                        if (this.mode === 'multiplayer' && this.socket) {
                            this.socket.emit('zombie-killed', { zombieId: zombie.id });
                        }
                        
                        // Check if wave is complete
                        if (this.zombies.length === 0) {
                            this.wave++;
                            this.spawnZombieWave();
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
        if (!player || this.isReloading || this.escMenuOpen) return;
        
        const weapon = this.weapons[this.currentWeapon];
        const now = Date.now();
        
        if (now - this.lastShot < weapon.fireRate) return;
        if (weapon.ammo <= 0) {
            this.reload();
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
        
        const bullet = {
            x: player.x,
            y: player.y,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            damage: weapon.damage,
            radius: 3,
            color: '#FFD700',
            playerId: this.currentPlayerId
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
        this.spawnZombieWave();
        
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (player) {
            player.health = 100;
            player.cash = 500;
        }
    }

    update() {
        if (this.escMenuOpen) return;
        
        this.processInput();
        this.updateZombies();
        this.updateBullets();
        this.updateUI();
    }

    fixedUpdate() {
        this.update();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
        this.drawZombies();
        this.drawBullets();
        this.drawPlayers();
    }

    drawBackground() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
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
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = player.color;
            this.ctx.fill();
            this.ctx.strokeStyle = player.borderColor;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            const healthPercent = player.health / player.maxHealth;
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
            this.ctx.fillRect(player.x - 20, player.y - 35, 40 * healthPercent, 4);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, player.x, player.y - player.radius - 20);
            this.ctx.fillText(player.weapon.toUpperCase(), player.x, player.y - player.radius - 8);
        });
    }

    drawZombies() {
        this.zombies.forEach(zombie => {
            this.ctx.beginPath();
            this.ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = zombie.color;
            this.ctx.fill();
            this.ctx.strokeStyle = zombie.borderColor;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            const healthPercent = zombie.health / zombie.maxHealth;
            this.ctx.fillStyle = '#F44336';
            this.ctx.fillRect(zombie.x - 20, zombie.y - 35, 40 * healthPercent, 4);
            
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

    updateUI() {
        if (typeof window.updateGameUI === 'function') {
            const player = this.players.find(p => p.id === this.currentPlayerId);
            window.updateGameUI(
                this.zombiesKilled,
                this.wave,
                this.cash,
                player ? player.health : 100,
                this.players,
                this.currentWeapon
            );
        }
    }

    gameLoop(currentTime) {
        // Fixed timestep game loop for consistent 60Hz
        if (!this.lastFrameTime) this.lastFrameTime = currentTime;
        
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        // Prevent spiral of death
        const frameTime = Math.min(deltaTime, 250);
        this.accumulator += frameTime;
        
        // Process fixed updates
        while (this.accumulator >= this.deltaTime) {
            this.fixedUpdate();
            this.accumulator -= this.deltaTime;
        }
        
        // Always render
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    start() {
        if (this.mode === 'singleplayer') {
            this.setupSinglePlayer();
        }
        this.gameLoop(0);
    }
}