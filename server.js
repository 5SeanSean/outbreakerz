const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Serve Socket.io client explicitly
app.get('/socket.io/socket.io.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
});

// Basic routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/multiplayer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'multiplayer.html'));
});

app.get('/game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'game.html'));
});

app.get('/singleplayer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'singleplayer.html'));
});

// Store game rooms
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomCode, playerName) => {
    socket.roomCode = roomCode;
    socket.join(roomCode);

    if (!rooms.has(roomCode)) {
        rooms.set(roomCode, {
            players: new Map(),
            targets: generateTargets(5),
            scores: new Map()
        });
    }

    const room = rooms.get(roomCode);
    const playerId = socket.id;
    
    // Make sure player positions are within canvas bounds
room.players.set(playerId, {
    id: playerId,
    name: playerName || `Player${room.players.size + 1}`,
    x: Math.random() * 600 + 100,
    y: Math.random() * 400 + 100,
    radius: 20,  // Make sure this exists
    color: getRandomColor(),
    borderColor: '#0288D1'  // Add this for consistency
});

    room.scores.set(playerId, 0);

    console.log(`Player ${playerId} joined room ${roomCode} at position ${room.players.get(playerId).x}, ${room.players.get(playerId).y}`);

    // Send current game state to new player
    socket.emit('game-state', {
        players: Array.from(room.players.values()),
        targets: room.targets,
        scores: Array.from(room.scores.entries()).map(([id, score]) => ({
            playerId: id,
            score: score
        }))
    });

    // Notify other players
    socket.to(roomCode).emit('player-joined', room.players.get(playerId));
    io.to(roomCode).emit('player-count', room.players.size);
});

    socket.on('player-move', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

        const room = rooms.get(roomCode);
        const player = room.players.get(socket.id);
        
        if (player) {
            player.x = data.x;
            player.y = data.y;

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
            room.targets.splice(targetIndex, 1);
            room.targets.push(generateTarget());

            const currentScore = room.scores.get(socket.id) || 0;
            room.scores.set(socket.id, currentScore + 10);

            io.to(roomCode).emit('target-collected', {
                targetIndex: targetIndex,
                newTarget: room.targets[room.targets.length - 1],
                playerId: socket.id,
                newScore: room.scores.get(socket.id)
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        const roomCode = socket.roomCode;
        if (roomCode && rooms.has(roomCode)) {
            const room = rooms.get(roomCode);
            
            room.players.delete(socket.id);
            room.scores.delete(socket.id);

            socket.to(roomCode).emit('player-left', socket.id);
            io.to(roomCode).emit('player-count', room.players.size);

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
        color: '#FF5252'
    };
}

function getRandomColor() {
    const colors = ['#4FC3F7', '#FF5252', '#69F0AE', '#FFD740', '#E040FB', '#18FFFF'];
    return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://163.192.106.72:${PORT}`);
});