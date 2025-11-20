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

// Define world boundaries (much larger than screen)
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;

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
    const spawnDistance = 100; // Spawn outside the play area
    
    switch(side) {
        case 0: x = Math.random() * WORLD_WIDTH; y = -spawnDistance; break;
        case 1: x = WORLD_WIDTH + spawnDistance; y = Math.random() * WORLD_HEIGHT; break;
        case 2: x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT + spawnDistance; break;
        case 3: x = -spawnDistance; y = Math.random() * WORLD_HEIGHT; break;
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