// Add these new socket event handlers to your existing server.js:

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
        player.weapon = weaponType;
        socket.to(roomCode).emit('weapon-changed', {
            playerId: socket.id,
            weapon: weaponType
        });
    }
});

// Update the game state interval to include zombies and bullets
setInterval(() => {
    rooms.forEach((room, roomCode) => {
        // Update zombies movement
        room.zombies.forEach(zombie => {
            // Simple zombie AI: move toward nearest player
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
            
            // Remove bullets that are off screen
            return bullet.x >= 0 && bullet.x <= 800 && 
                   bullet.y >= 0 && bullet.y <= 600;
        });

        io.to(roomCode).emit('game-state', {
            players: Array.from(room.players.values()),
            zombies: room.zombies,
            bullets: room.bullets,
            wave: room.wave || 1,
            gameState: room.gameState || 'buy',
            waveTimer: room.waveTimer || 0
        });
    });
}, 1000 / 60); // 60 ticks per second