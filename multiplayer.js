function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function createRoom() {
    const roomCode = generateRoomCode();
    const roomLink = `${window.location.origin}/game.html?room=${roomCode}`;
    
    document.getElementById('roomLink').textContent = roomLink;
    document.getElementById('roomInfo').style.display = 'block';
    
    // Store room code for the game page
    localStorage.setItem('roomCode', roomCode);
    localStorage.setItem('isHost', 'true');
    
    // Redirect to game after a moment so user can copy link
    setTimeout(() => {
        window.location.href = `game.html?room=${roomCode}`;
    }, 3000);
}

function joinRoom() {
    const roomCode = document.getElementById('roomCode').value.toUpperCase();
    if (roomCode.length !== 6) {
        alert('Please enter a valid 6-character room code');
        return;
    }
    
    localStorage.setItem('roomCode', roomCode);
    localStorage.setItem('isHost', 'false');
    window.location.href = `game.html?room=${roomCode}`;
}

function copyRoomLink() {
    const roomLink = document.getElementById('roomLink').textContent;
    navigator.clipboard.writeText(roomLink).then(() => {
        alert('Room link copied to clipboard!');
    });
}