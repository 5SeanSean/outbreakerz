const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(__dirname));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Store game rooms
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomCode) => {
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
            x: Math.random() * 700 + 50,
            y: Math.random() * 500 + 50,
            color: getRandomColor()
        });

        // Send game state to new player
        socket.emit('game-state', {
            players: Array.from(room.players.values()),
            targets: room.targets
        });

        // Notify others
        socket.to(roomCode).emit('player-joined', room.players.get(socket.id));
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

    socket.on('disconnect', () => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms.has(roomCode)) {
            const room = rooms.get(roomCode);
            room.players.delete(socket.id);
            socket.to(roomCode).emit('player-left', socket.id);
        }
    });
});

function generateTargets(count) {
    const targets = [];
    for (let i = 0; i < count; i++) {
        targets.push({
            x: Math.random() * 700 + 50,
            y: Math.random() * 500 + 50,
            radius: 15,
            color: '#FF5252'
        });
    }
    return targets;
}

function getRandomColor() {
    const colors = ['#4FC3F7', '#FF5252', '#69F0AE', '#FFD740', '#E040FB'];
    return colors[Math.floor(Math.random() * colors.length)];
}

const PORT = 80;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://163.192.106.72:${PORT}`);
});