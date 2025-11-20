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
        
        this.currentWeapon = 'pistol';
        this.lastShot = 0;
        this.isReloading = false;
        this.escMenuOpen = false;
        this.lastFrameTime = 0;
        this.gameStarted = false;
        this.isPaused = false;
        
        // Camera for client-side rendering
        this.camera = {
            x: 0,
            y: 0
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Handle tab visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.isPaused = true;
            } else {
                this.isPaused = false;
                this.lastFrameTime = performance.now();
            }
        });
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
            borderColor: '#0288D1',
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
        
        console.log('Setting up multiplayer for player:', playerId);
        
        // Handle game state updates from server
        socket.on('game-state', (data) => {
            console.log('Received game state:', data);
            
            // Update players from server
            if (data.players && data.players.length > 0) {
                const serverPlayers = data.players.map(p => ({
                    ...p,
                    borderColor: this.getBorderColor(p.color)
                }));
                
                const localPlayerData = serverPlayers.find(p => p.id === this.currentPlayerId);
                
                if (localPlayerData) {
                    const existingLocalPlayer = this.players.find(p => p.id === this.currentPlayerId);
                    
                    if (existingLocalPlayer) {
                        // Update local player stats but keep position client-side
                        existingLocalPlayer.health = localPlayerData.health;
                        existingLocalPlayer.weapon = localPlayerData.weapon;
                        existingLocalPlayer.cash = localPlayerData.cash;
                        existingLocalPlayer.color = localPlayerData.color;
                        existingLocalPlayer.borderColor = localPlayerData.borderColor;
                        existingLocalPlayer.name = localPlayerData.name;
                        
                        this.cash = localPlayerData.cash;
                        this.currentWeapon = localPlayerData.weapon;
                    } else {
                        // First time - create local player
                        this.players.push(localPlayerData);
                        this.cash = localPlayerData.cash;
                        this.currentWeapon = localPlayerData.weapon;
                        console.log('Local player created:', localPlayerData);
                    }
                    
                    // Add/update other players (their positions come from server)
                    serverPlayers.forEach(serverPlayer => {
                        if (serverPlayer.id !== this.currentPlayerId) {
                            const existingPlayer = this.players.find(p => p.id === serverPlayer.id);
                            if (existingPlayer) {
                                Object.assign(existingPlayer, serverPlayer);
                            } else {
                                this.players.push(serverPlayer);
                            }
                        }
                    });
                    
                    // Remove players that are no longer in server data
                    this.players = this.players.filter(p => 
                        serverPlayers.some(sp => sp.id === p.id)
                    );
                }
            }
            
            // Update zombies from server (authoritative positions)
            if (data.zombies) {
                data.zombies.forEach(serverZombie => {
                    const localZombie = this.zombies.find(z => z.id === serverZombie.id);
                    if (localZombie) {
                        // Smooth interpolation
                        localZombie.targetX = serverZombie.x;
                        localZombie.targetY = serverZombie.y;
                        localZombie.health = serverZombie.health;
                        localZombie.maxHealth = serverZombie.maxHealth;
                        localZombie.speed = serverZombie.speed;
                    } else {
                        // Add new zombies
                        this.zombies.push({
                            ...serverZombie,
                            targetX: serverZombie.x,
                            targetY: serverZombie.y
                        });
                    }
                });
                
                // Remove zombies that no longer exist on server
                this.zombies = this.zombies.filter(z => 
                    data.zombies.some(sz => sz.id === z.id)
                );
            }
            
            this.wave = data.wave || 1;
        });

        socket.on('zombie-damaged', (data) => {
            const zombie = this.zombies.find(z => z.id === data.zombieId);
            if (zombie) {
                zombie.health = data.health;
                zombie.maxHealth = data.maxHealth;
            }
        });

        socket.on('zombie-killed', (data) => {
            // Remove zombie immediately
            this.zombies = this.zombies.filter(z => z.id !== data.zombieId);
            
            // Update killer's cash
            if (data.shooterId === this.currentPlayerId) {
                this.zombiesKilled++;
                this.cash += 25;
                const player = this.players.find(p => p.id === this.currentPlayerId);
                if (player) {
                    player.cash = this.cash;
                }
            }
        });

        socket.on('wave-complete', (data) => {
            this.wave = data.wave;
            this.zombies = data.zombies.map(z => ({
                ...z,
                targetX: z.x,
                targetY: z.y
            }));
        });

        socket.on('player-joined', (playerData) => {
            console.log('Player joined:', playerData);
            if (!this.players.find(p => p.id === playerData.id)) {
                this.players.push({
                    ...playerData,
                    borderColor: this.getBorderColor(playerData.color)
                });
            }
        });

        socket.on('player-left', (playerId) => {
            console.log('Player left:', playerId);
            this.players = this.players.filter(p => p.id !== playerId);
        });

        socket.on('player-update', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player && player.id !== this.currentPlayerId) {
                player.x = data.x;
                player.y = data.y;
                player.health = data.health;
                player.weapon = data.weapon;
            }
        });

        socket.on('bullet-created', (bulletData) => {
            if (bulletData.playerId !== this.currentPlayerId) {
                this.bullets.push(bulletData);
            }
        });

        socket.on('player-died', (data) => {
            const player = this.players.find(p => p.id === data.playerId);
            if (player) {
                player.health = 0;
            }
        });
    }

    getBorderColor(color) {
        const colors = {
            '#4FC3F7': '#0288D1',
            '#FF5252': '#C62828',
            '#69F0AE': '#00C853',
            '#FFD740': '#F9A825',
            '#E040FB': '#AA00FF',
            '#18FFFF': '#00B8D4'
        };
        return colors[color] || '#000000';
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
            
            if (e.key === '1') this.switchWeapon('pistol');
            if (e.key === '2' && this.cash >= 1000) this.switchWeapon('shotgun');
            if (e.key === '3' && this.cash >= 2000) this.switchWeapon('rifle');
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (this.escMenuOpen) return;
            this.shoot(e);
        });

        window.selectWeapon = (weaponType) => {
            if (this.escMenuOpen) return;
            const weapon = this.weapons[weaponType];
            if (weaponType === 'pistol' || this.cash >= weapon.cost) {
                this.switchWeapon(weaponType);
            }
        };

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
        this.isPaused = this.escMenuOpen;
        const escMenu = document.getElementById('escMenu');
        if (escMenu) {
            escMenu.style.display = this.escMenuOpen ? 'block' : 'none';
        }
    }

    switchWeapon(weaponType) {
        const weapon = this.weapons[weaponType];
        
        if (weaponType !== 'pistol' && this.cash < weapon.cost) {
            return;
        }
        
        if (weaponType !== this.currentWeapon && weaponType !== 'pistol') {
            this.cash -= weapon.cost;
        }
        
        this.currentWeapon = weaponType;
        
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (player) {
            player.weapon = weaponType;
            player.cash = this.cash;
            
            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('player-action', {
                    type: 'weapon-change',
                    weapon: weaponType,
                    cash: this.cash
                });
            }
        }
        
        this.updateUI();
    }

    handleMovement() {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player || this.escMenuOpen || this.isPaused) return;

        let moved = false;
        let newX = player.x;
        let newY = player.y;

        if (this.keys['w']) { 
            newY = Math.max(player.radius, player.y - player.speed); 
            moved = true; 
        }
        if (this.keys['s']) { 
            newY = player.y + player.speed;
            moved = true; 
        }
        if (this.keys['a']) { 
            newX = Math.max(player.radius, player.x - player.speed); 
            moved = true; 
        }
        if (this.keys['d']) { 
            newX = player.x + player.speed;
            moved = true; 
        }

        if (moved) {
            player.x = newX;
            player.y = newY;

            // Update camera to follow player
            this.camera.x = player.x - this.canvas.width / 2;
            this.camera.y = player.y - this.canvas.height / 2;

            if (this.mode === 'multiplayer' && this.socket) {
                this.socket.emit('player-move', { 
                    x: newX, 
                    y: newY,
                    health: player.health,
                    weapon: player.weapon
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
            case 0: x = Math.random() * this.canvas.width; y = -50; break;
            case 1: x = this.canvas.width + 50; y = Math.random() * this.canvas.height; break;
            case 2: x = Math.random() * this.canvas.width; y = this.canvas.height + 50; break;
            case 3: x = -50; y = Math.random() * this.canvas.height; break;
        }
        
        return {
            id: Math.random().toString(36).substr(2, 9),
            x: x,
            y: y,
            targetX: x,
            targetY: y,
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
            if (this.mode === 'multiplayer') {
                // Client-side interpolation
                const lerpFactor = 0.3;
                zombie.x += (zombie.targetX - zombie.x) * lerpFactor;
                zombie.y += (zombie.targetY - zombie.y) * lerpFactor;
            } else {
                // Singleplayer: full client control
                const dx = player.x - zombie.x;
                const dy = player.y - zombie.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    zombie.x += (dx / distance) * zombie.speed;
                    zombie.y += (dy / distance) * zombie.speed;
                }
            }

            // Check collision with local player
            const dx = player.x - zombie.x;
            const dy = player.y - zombie.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < player.radius + zombie.radius) {
                this.playerTakeDamage(zombie.damage);
            }
        });
    }

    updateBullets() {
        this.bullets = this.bullets.filter((bullet) => {
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            
            if (bullet.x < -100 || bullet.x > 10000 || 
                bullet.y < -100 || bullet.y > 10000) {
                return false;
            }
            
            let bulletHit = false;
            this.zombies.forEach((zombie) => {
                const dx = bullet.x - zombie.x;
                const dy = bullet.y - zombie.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < zombie.radius && !bulletHit) {
                    bulletHit = true;
                    
                    if (bullet.playerId === this.currentPlayerId) {
                        if (this.mode === 'multiplayer' && this.socket) {
                            // Send hit to server
                            this.socket.emit('zombie-hit', {
                                zombieId: zombie.id,
                                damage: bullet.damage,
                                shooterId: this.currentPlayerId
                            });
                        } else {
                            // Singleplayer - handle locally
                            zombie.health -= bullet.damage;
                            
                            if (zombie.health <= 0) {
                                this.zombiesKilled++;
                                this.cash += 25;
                                const player = this.players.find(p => p.id === this.currentPlayerId);
                                if (player) {
                                    player.cash = this.cash;
                                }
                                
                                this.zombies = this.zombies.filter(z => z.id !== zombie.id);
                                
                                if (this.zombies.length === 0) {
                                    this.wave++;
                                    this.spawnZombieWave();
                                }
                            }
                        }
                    }
                }
            });
            
            return !bulletHit;
        });
    }

    shoot(e) {
        const player = this.players.find(p => p.id === this.currentPlayerId);
        if (!player || this.isReloading || this.escMenuOpen || this.isPaused) return;
        
        const weapon = this.weapons[this.currentWeapon];
        const now = Date.now();
        
        if (now - this.lastShot < weapon.fireRate) return;
        if (weapon.ammo <= 0) {
            this.reload();
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const mouseX = (e.clientX - rect.left) * scaleX + this.camera.x;
        const mouseY = (e.clientY - rect.top) * scaleY + this.camera.y;
        
        const angle = Math.atan2(mouseY - player.y, mouseX - player.x);
        
        const bullet = {
            id: Math.random().toString(36).substr(2, 9),
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
        
        player.health = Math.max(0, player.health - damage);
        
        if (player.health <= 0) {
            this.gameOver();
        }
        
        if (this.mode === 'multiplayer' && this.socket) {
            this.socket.emit('player-action', {
                type: 'damage-taken',
                damage: damage,
                health: player.health
            });
        }
    }

    gameOver() {
        alert(`Game Over! You survived ${this.wave} waves and killed ${this.zombiesKilled} zombies.`);
        
        if (this.mode === 'singleplayer') {
            this.wave = 1;
            this.zombiesKilled = 0;
            this.cash = 500;
            this.spawnZombieWave();
            
            const player = this.players.find(p => p.id === this.currentPlayerId);
            if (player) {
                player.health = 100;
                player.cash = 500;
            }
        } else if (this.mode === 'multiplayer' && this.socket) {
            this.socket.emit('player-action', {
                type: 'player-died'
            });
            window.location.href = 'index.html';
        }
    }

    update() {
        if (this.escMenuOpen || this.isPaused) return;
        
        this.handleMovement();
        this.updateZombies();
        this.updateBullets();
        this.updateUI();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        this.drawBackground();
        this.drawZombies();
        this.drawBullets();
        this.drawPlayers();
        
        this.ctx.restore();
    }

    drawBackground() {
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(this.camera.x, this.camera.y, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
        const startX = Math.floor(this.camera.x / 50) * 50;
        const startY = Math.floor(this.camera.y / 50) * 50;
        
        for (let x = startX; x < this.camera.x + this.canvas.width; x += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.camera.y);
            this.ctx.lineTo(x, this.camera.y + this.canvas.height);
            this.ctx.stroke();
        }
        for (let y = startY; y < this.camera.y + this.canvas.height; y += 50) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.camera.x, y);
            this.ctx.lineTo(this.camera.x + this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPlayers() {
        this.players.forEach(player => {
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
            this.ctx.fillStyle = player.color;
            this.ctx.fill();
            this.ctx.strokeStyle = player.borderColor || '#000000';
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
            
            const healthPercent = player.health / player.maxHealth;
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
            this.ctx.fillRect(player.x - 20, player.y - 35, 40 * healthPercent, 4);
            
            this.ctx.fillStyle = 'white';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, player.x, player.y - player.radius - 20);
            this.ctx.font = '10px Arial';
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
            
            this.ctx.strokeStyle = '#1a1a1a';
            this.ctx.lineWidth = 2;
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
        const deltaTime = currentTime - this.lastFrameTime;
        this.lastFrameTime = currentTime;
        
        this.update();
        this.draw();
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }

    start() {
        if (!this.gameStarted) {
            this.gameStarted = true;
            if (this.mode === 'singleplayer') {
                this.setupSinglePlayer();
            }
            this.lastFrameTime = performance.now();
            this.gameLoop(this.lastFrameTime);
            console.log('Game loop started');
        }
    }
}