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
    pingInterval: 1000 / 128, // 128 tick rate
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

// Game loop for server-side updates
setInterval(() => {
    rooms.forEach((room, roomCode) => {
        io.to(roomCode).emit('game-state', {
            players: Array.from(room.players.values()),
            targets: room.targets
        });
    });
}, 1000 / 128); // 128 ticks per second

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
                targets: generateTargets(5)
            });
        }

        const room = rooms.get(roomCode);
        
        room.players.set(socket.id, {
            id: socket.id,
            name: playerName || `Player${room.players.size + 1}`,
            x: Math.random() * 600 + 100,
            y: Math.random() * 400 + 100,
            radius: 20,
            speed: 5,
            color: getRandomColor(),
            borderColor: '#0288D1'
        });

        console.log(`Player ${socket.id} joined room ${roomCode}`);
        
        // Send initial game state
        socket.emit('game-state', {
            players: Array.from(room.players.values()),
            targets: room.targets
        });

        // Notify other players
        socket.to(roomCode).emit('player-joined', room.players.get(socket.id));
    });

    socket.on('player-move', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) {
            console.log('Invalid room for movement');
            return;
        }

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            player.x = data.x;
            player.y = data.y;
            
            // Broadcast movement to other players
            socket.to(roomCode).emit('player-moved', {
                playerId: socket.id,
                x: data.x,
                y: data.y
            });
        }
    });

    socket.on('collect-target', (targetIndex) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        
        if (room.targets[targetIndex]) {
            // Replace collected target
            room.targets[targetIndex] = generateTarget();
            
            io.to(roomCode).emit('target-collected', {
                targetIndex: targetIndex,
                newTarget: room.targets[targetIndex],
                playerId: socket.id
            });
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

function generateTargets(count) {
    const targets = [];
    for (let i = 0; i < count; i++) {
        targets.push(generateTarget());
    }
    return targets;
}

function generateTarget() {
    return {
        x: Math.random() * 700 + 50,
        y: Math.random() * 500 + 50,
        radius: 15,
        color: '#FF5252',
        borderColor: '#D32F2F'
    };
}

function getRandomColor() {
    const colors = ['#4FC3F7', '#FF5252', '#69F0AE', '#FFD740', '#E040FB', '#18FFFF'];
    return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = 3000;
const HOST = '0.0.0.0'; // Listen on all interfaces

server.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://163.192.106.72:${PORT}`);
    console.log(`📡 Also accessible via your domain if configured`);
});