const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

// Store game rooms
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomCode, playerName) => {
        // Leave any previous rooms
        if (socket.roomCode) {
            socket.leave(socket.roomCode);
        }

        socket.roomCode = roomCode;
        socket.join(roomCode);

        // Initialize room if it doesn't exist
        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, {
                players: new Map(),
                targets: generateTargets(5),
                scores: new Map()
            });
        }

        const room = rooms.get(roomCode);

        // Add player to room
        const playerId = socket.id;
        room.players.set(playerId, {
            id: playerId,
            name: playerName || `Player${room.players.size + 1}`,
            x: Math.random() * 700 + 50,
            y: Math.random() * 500 + 50,
            color: getRandomColor()
        });

        room.scores.set(playerId, 0);

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

        console.log(`Player ${playerId} joined room ${roomCode}`);
    });

    socket.on('player-move', (data) => {
        const roomCode = socket.roomCode;
        if (!roomCode || !rooms.has(roomCode)) return;

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
            // Remove target and create new one
            room.targets.splice(targetIndex, 1);
            room.targets.push(generateTarget());

            // Update score
            const currentScore = room.scores.get(socket.id) || 0;
            room.scores.set(socket.id, currentScore + 10);

            // Broadcast to all players in room
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

            // Notify other players
            socket.to(roomCode).emit('player-left', socket.id);
            io.to(roomCode).emit('player-count', room.players.size);

            // Clean up empty rooms
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Game available at: http://163.192.106.72:${PORT}`);
});