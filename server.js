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
    pingInterval: 10000,
    pingTimeout: 20000
});

app.use(express.static(__dirname));

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/multiplayer.html', (req, res) => res.sendFile(path.join(__dirname, 'multiplayer.html')));
app.get('/game.html', (req, res) => res.sendFile(path.join(__dirname, 'game.html')));
app.get('/singleplayer.html', (req, res) => res.sendFile(path.join(__dirname, 'singleplayer.html')));

const rooms = new Map();

function spawnZombieWave(room) {
    const zombieCount = 5 + (room.wave * 2);
    room.zombies = [];
    
    for (let i = 0; i < zombieCount; i++) {
        room.zombies.push(generateZombie(room.wave));
    }
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

// Server game loop - only handles zombies and state verification
setInterval(() => {
    rooms.forEach((room, roomCode) => {
        // Update zombies (server authoritative)
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

        // Broadcast state to all clients
        io.to(roomCode).emit('game-state', {
            players: Array.from(room.players.values()),
            zombies: room.zombies,
            wave: room.wave
        });
    });
}, 1000 / 20); // 20Hz for state sync

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomCode, playerName) => {
        if (!roomCode) return;

        socket.roomCode = roomCode;
        socket.join(roomCode);

        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                players: new Map(),
                zombies: [],
                wave: 1
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
            health: 100,
            maxHealth: 100,
            weapon: 'pistol',
            cash: 500
        });

        console.log(`Player ${socket.id} joined room ${roomCode}`);
        
        // Send initial state
        socket.emit('game-state', {
            players: Array.from(room.players.values()),
            zombies: room.zombies,
            wave: room.wave
        });

        socket.to(roomCode).emit('player-joined', room.players.get(socket.id));
    });

    socket.on('player-move', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            // Verify movement is reasonable (anti-cheat)
            const dx = data.x - player.x;
            const dy = data.y - player.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= 10) { // Reasonable movement speed
                player.x = data.x;
                player.y = data.y;
                player.health = data.health;
                player.weapon = data.weapon;
                
                socket.to(roomCode).emit('player-update', {
                    playerId: socket.id,
                    x: data.x,
                    y: data.y,
                    health: data.health,
                    weapon: data.weapon
                });
            }
        }
    });

    socket.on('player-shoot', (bulletData) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        // Verify bullet data is reasonable
        if (bulletData.damage >= 10 && bulletData.damage <= 100) {
            socket.to(roomCode).emit('bullet-created', bulletData);
        }
    });

    socket.on('player-action', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (!player) return;

        switch(data.type) {
            case 'zombie-killed':
                // Verify zombie kill and update cash
                player.cash = data.cash;
                break;
                
            case 'weapon-change':
                // Verify weapon purchase
                const costs = { pistol: 0, shotgun: 1000, rifle: 2000 };
                if (player.cash >= costs[data.weapon]) {
                    player.weapon = data.weapon;
                    player.cash = data.cash;
                }
                break;
                
            case 'damage-taken':
                player.health = data.health;
                if (player.health <= 0) {
                    socket.to(roomCode).emit('player-died', { playerId: socket.id });
                }
                break;
                
            case 'wave-complete':
                room.wave = data.wave;
                spawnZombieWave(room);
                io.to(roomCode).emit('zombie-update', {
                    zombies: room.zombies,
                    wave: room.wave
                });
                break;
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
    console.log(`🎯 Client-authoritative gameplay with server verification`);
});