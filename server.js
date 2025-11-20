const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingInterval: 1000 / 60, // 60Hz ping rate
    pingTimeout: 5000
});

// Serve static files
app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/multiplayer.html', (req, res) => res.sendFile(path.join(__dirname, 'multiplayer.html')));
app.get('/game.html', (req, res) => res.sendFile(path.join(__dirname, 'game.html')));
app.get('/singleplayer.html', (req, res) => res.sendFile(path.join(__dirname, 'singleplayer.html')));

// Game state management
const rooms = new Map();

// Helper functions
function spawnZombieWave(room) {
    const zombieCount = 5 + (room.wave * 2);
    room.zombies = [];
    
    for (let i = 0; i < zombieCount; i++) {
        room.zombies.push(generateZombie(room.wave));
    }
    console.log(`Spawned ${zombieCount} zombies for wave ${room.wave}`);
}

function generateZombie(wave) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    
    switch(side) {
        case 0: x = Math.random() * 800; y = -50; break;
        case 1: x = 850; y = Math.random() * 600; break;
        case 2: x = Math.random() * 800; y = 650; break;
        case 3: x = -50; y = Math.random() * 600; break;
    }
    
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: x,
        y: y,
        radius: 25,
        speed: 1 + (wave * 0.1),
        health: 50 + (wave * 10),
        maxHealth: 50 + (wave * 10),
        color: '#4CAF50',
        borderColor: '#2E7D32',
        damage: 20
    };
}

function getRandomColor() {
    const colors = ['#4FC3F7', '#FF5252', '#69F0AE', '#FFD740', '#E040FB', '#18FFFF'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Global game loop running at 60Hz
setInterval(() => {
    const now = Date.now();
    
    rooms.forEach((room, roomCode) => {
        if (room.gameState === 'fight') {
            // Update zombies
            room.zombies.forEach(zombie => {
                const players = Array.from(room.players.values());
                if (players.length > 0) {
                    const nearestPlayer = players.reduce((nearest, player) => {
                        const dist = Math.sqrt((zombie.x - player.x) ** 2 + (zombie.y - player.y) ** 2);
                        return dist < nearest.dist ? { player, dist } : nearest;
                    }, { player: players[0], dist: Infinity });
                    
                    const dx = nearestPlayer.player.x - zombie.x;
                    const dy = nearestPlayer.player.y - zombie.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance > 0) {
                        zombie.x += (dx / distance) * zombie.speed;
                        zombie.y += (dy / distance) * zombie.speed;
                    }
                }
            });
            
            // Update bullets
            room.bullets = room.bullets.filter(bullet => {
                bullet.x += bullet.vx;
                bullet.y += bullet.vy;
                return bullet.x >= 0 && bullet.x <= 800 && bullet.y >= 0 && bullet.y <= 600;
            });
            
            // Check bullet-zombie collisions on server
            room.bullets.forEach((bullet, bulletIndex) => {
                room.zombies.forEach((zombie, zombieIndex) => {
                    const dx = bullet.x - zombie.x;
                    const dy = bullet.y - zombie.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < zombie.radius) {
                        zombie.health -= bullet.damage;
                        room.bullets.splice(bulletIndex, 1);
                        
                        if (zombie.health <= 0) {
                            room.zombies.splice(zombieIndex, 1);
                            
                            // Give cash to player who shot the bullet
                            const player = room.players.get(bullet.playerId);
                            if (player) {
                                player.cash += 25;
                            }
                            
                            io.to(roomCode).emit('zombie-killed', { 
                                zombieId: zombie.id,
                                playerId: bullet.playerId
                            });
                            
                            // Spawn new wave if all zombies are dead
                            if (room.zombies.length === 0) {
                                room.wave++;
                                spawnZombieWave(room);
                            }
                        }
                    }
                });
            });
        }
        
        // Broadcast game state at 20Hz (smoother but not too bandwidth heavy)
        if (now - (room.lastBroadcast || 0) > 50) { // 20 times per second
            io.to(roomCode).emit('game-state', {
                players: Array.from(room.players.values()),
                zombies: room.zombies,
                bullets: room.bullets,
                wave: room.wave,
                gameState: room.gameState
            });
            room.lastBroadcast = now;
        }
    });
}, 1000 / 60); // 60Hz server tick rate

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomCode, playerName) => {
        if (!roomCode) {
            console.log('No room code provided');
            return;
        }

        socket.roomCode = roomCode;
        socket.join(roomCode);

        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                players: new Map(),
                zombies: [],
                bullets: [],
                wave: 1,
                gameState: 'fight',
                lastBroadcast: 0
            });
            
            const room = rooms.get(roomCode);
            spawnZombieWave(room);
        }

        const room = rooms.get(roomCode);
        
        room.players.set(socket.id, {
            id: socket.id,
            name: playerName || `Survivor${room.players.size + 1}`,
            x: 400,
            y: 300,
            radius: 20,
            speed: 5,
            color: getRandomColor(),
            borderColor: '#0288D1',
            health: 100,
            maxHealth: 100,
            weapon: 'pistol',
            cash: 500
        });

        console.log(`Player ${socket.id} joined room ${roomCode}`);
        
        // Send initial game state
        socket.emit('game-state', {
            players: Array.from(room.players.values()),
            zombies: room.zombies,
            bullets: room.bullets,
            wave: room.wave,
            gameState: room.gameState
        });

        // Notify other players
        socket.to(roomCode).emit('player-joined', room.players.get(socket.id));
    });

    socket.on('player-move', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            // Update player position immediately
            player.x = data.x;
            player.y = data.y;
            
            // Broadcast to other players (no need to broadcast back to sender)
            socket.to(roomCode).emit('player-moved', {
                playerId: socket.id,
                x: data.x,
                y: data.y
            });
        }
    });

    socket.on('player-shoot', (bulletData) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        bulletData.id = Math.random().toString(36).substr(2, 9);
        room.bullets.push(bulletData);
        
        socket.to(roomCode).emit('bullet-fired', bulletData);
    });

    socket.on('zombie-damaged', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const zombie = room.zombies.find(z => z.id === data.zombieId);
        
        if (zombie) {
            zombie.health -= data.damage;
            if (zombie.health <= 0) {
                room.zombies = room.zombies.filter(z => z.id !== data.zombieId);
                
                // Give cash to player who killed the zombie
                const player = room.players.get(socket.id);
                if (player) {
                    player.cash += 25;
                }
                
                socket.to(roomCode).emit('zombie-killed', { 
                    zombieId: data.zombieId,
                    playerId: socket.id
                });
            }
        }
    });

    socket.on('weapon-purchase', (weaponType) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            // Simple weapon costs
            const costs = {
                pistol: 0,
                shotgun: 1000,
                rifle: 2000
            };
            
            const cost = costs[weaponType];
            if (player.cash >= cost) {
                player.cash -= cost;
                player.weapon = weaponType;
                
                socket.to(roomCode).emit('weapon-changed', {
                    playerId: socket.id,
                    weapon: weaponType
                });
            }
        }
    });

    socket.on('player-damage', (damage) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            player.health -= damage;
            if (player.health <= 0) {
                player.health = 0;
                // Handle player death
            }
            
            socket.to(roomCode).emit('player-hit', {
                playerId: socket.id,
                newHealth: player.health
            });
        }
    });

    socket.on('start-wave', () => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        if (room.gameState === 'buy') {
            room.gameState = 'fight';
            spawnZombieWave(room);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const roomCode = socket.roomCode;
        if (roomCode && rooms.has(roomCode)) {
            const room = rooms.get(roomCode);
            room.players.delete(socket.id);
            
            socket.to(roomCode).emit('player-left', socket.id);

            if (room.players.size === 0) {
                rooms.delete(roomCode);
                console.log(`Room ${roomCode} deleted`);
            }
        }
    });
});

const PORT = 80;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`🚀 Zombie Horde Server running on http://163.192.106.72:${PORT}`);
    console.log(`🎮 Game modes: Single Player Practice & Multiplayer Co-op`);
    console.log(`⏱️  60Hz server tick rate with client-side prediction`);
});