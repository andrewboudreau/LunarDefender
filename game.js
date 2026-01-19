// Lunar Defender - Co-op Space Rocks Game
// Uses PeerJS for WebRTC multiplayer

// ============== GAME CONFIG ==============
const CONFIG = {
    width: 1200,
    height: 800,
    shipSize: 20,
    shipThrust: 0.15,
    shipFriction: 0.99,
    shipRotSpeed: 0.08,
    bulletSpeed: 8,
    bulletLife: 60,
    rockSizes: [40, 25, 15],
    rockSpeed: 2,
    initialRocks: 5,
    networkTickRate: 50, // ms between network updates
};

// ============== GAME STATE ==============
let canvas, ctx;
let isHost = false;
let gameRunning = false;
let myId = null;
let peer = null;
let connections = []; // For host: all client connections
let hostConnection = null; // For client: connection to host

// Game objects (host authoritative)
let ships = {}; // { odspeeId: shipObject }
let rocks = [];
let bullets = [];

// Local input state
let keys = {
    left: false,
    right: false,
    up: false,
    space: false
};
let lastShot = 0;

// ============== UTILITIES ==============
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function randomColor() {
    const colors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function wrapPosition(obj) {
    if (obj.x < 0) obj.x = CONFIG.width;
    if (obj.x > CONFIG.width) obj.x = 0;
    if (obj.y < 0) obj.y = CONFIG.height;
    if (obj.y > CONFIG.height) obj.y = 0;
}

function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ============== SHIP ==============
function createShip(id, x, y, color) {
    return {
        id: id,
        x: x || CONFIG.width / 2,
        y: y || CONFIG.height / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        color: color || randomColor(),
        thrusting: false
    };
}

function updateShip(ship, input) {
    // Rotation
    if (input.left) ship.angle -= CONFIG.shipRotSpeed;
    if (input.right) ship.angle += CONFIG.shipRotSpeed;

    // Thrust
    ship.thrusting = input.up;
    if (input.up) {
        ship.vx += Math.cos(ship.angle) * CONFIG.shipThrust;
        ship.vy += Math.sin(ship.angle) * CONFIG.shipThrust;
    }

    // Friction
    ship.vx *= CONFIG.shipFriction;
    ship.vy *= CONFIG.shipFriction;

    // Move
    ship.x += ship.vx;
    ship.y += ship.vy;

    // Wrap
    wrapPosition(ship);
}

function drawShip(ship) {
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);

    // Ship body
    ctx.strokeStyle = ship.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CONFIG.shipSize, 0);
    ctx.lineTo(-CONFIG.shipSize / 2, -CONFIG.shipSize / 2);
    ctx.lineTo(-CONFIG.shipSize / 3, 0);
    ctx.lineTo(-CONFIG.shipSize / 2, CONFIG.shipSize / 2);
    ctx.closePath();
    ctx.stroke();

    // Thrust flame
    if (ship.thrusting) {
        ctx.strokeStyle = '#f80';
        ctx.beginPath();
        ctx.moveTo(-CONFIG.shipSize / 3, -CONFIG.shipSize / 4);
        ctx.lineTo(-CONFIG.shipSize, 0);
        ctx.lineTo(-CONFIG.shipSize / 3, CONFIG.shipSize / 4);
        ctx.stroke();
    }

    ctx.restore();
}

// ============== ROCKS ==============
function createRock(x, y, size) {
    const sizeIndex = size !== undefined ? size : 0;
    const radius = CONFIG.rockSizes[sizeIndex];
    const angle = Math.random() * Math.PI * 2;
    const speed = CONFIG.rockSpeed * (1 + Math.random());

    // Create jagged shape
    const vertices = [];
    const numVertices = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVertices; i++) {
        const a = (i / numVertices) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.3);
        vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        x: x !== undefined ? x : Math.random() * CONFIG.width,
        y: y !== undefined ? y : Math.random() * CONFIG.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: radius,
        sizeIndex: sizeIndex,
        vertices: vertices,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.02
    };
}

function updateRock(rock) {
    rock.x += rock.vx;
    rock.y += rock.vy;
    rock.rotation += rock.rotSpeed;
    wrapPosition(rock);
}

function drawRock(rock) {
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.rotation);

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rock.vertices[0].x, rock.vertices[0].y);
    for (let i = 1; i < rock.vertices.length; i++) {
        ctx.lineTo(rock.vertices[i].x, rock.vertices[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.restore();
}

function spawnInitialRocks() {
    rocks = [];
    for (let i = 0; i < CONFIG.initialRocks; i++) {
        // Spawn away from center
        let x, y;
        do {
            x = Math.random() * CONFIG.width;
            y = Math.random() * CONFIG.height;
        } while (distance({ x, y }, { x: CONFIG.width / 2, y: CONFIG.height / 2 }) < 150);

        rocks.push(createRock(x, y, 0));
    }
}

// ============== BULLETS ==============
function createBullet(ship) {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: ship.x + Math.cos(ship.angle) * CONFIG.shipSize,
        y: ship.y + Math.sin(ship.angle) * CONFIG.shipSize,
        vx: Math.cos(ship.angle) * CONFIG.bulletSpeed + ship.vx,
        vy: Math.sin(ship.angle) * CONFIG.bulletSpeed + ship.vy,
        life: CONFIG.bulletLife,
        color: ship.color,
        ownerId: ship.id
    };
}

function updateBullet(bullet) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.life--;
    wrapPosition(bullet);
}

function drawBullet(bullet) {
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
    ctx.fill();
}

// ============== COLLISION ==============
function checkCollisions() {
    if (!isHost) return;

    // Bullets vs Rocks
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            if (distance(bullet, rock) < rock.radius) {
                // Remove bullet
                bullets.splice(i, 1);

                // Split or destroy rock
                if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                    // Split into smaller rocks
                    for (let k = 0; k < 2; k++) {
                        rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                    }
                }
                rocks.splice(j, 1);

                // Respawn rocks if all destroyed
                if (rocks.length === 0) {
                    setTimeout(() => {
                        if (isHost && gameRunning) {
                            spawnInitialRocks();
                            broadcastState();
                        }
                    }, 2000);
                }

                break;
            }
        }
    }
}

// ============== NETWORKING ==============
function setupHost() {
    const roomCode = generateRoomCode();
    document.getElementById('room-code').textContent = roomCode;

    peer = new Peer(roomCode, {
        debug: 1
    });

    peer.on('open', (id) => {
        console.log('Host peer opened with ID:', id);
        myId = id;
        isHost = true;
        document.getElementById('status').textContent = 'Room ready! Share the code above.';
    });

    peer.on('connection', (conn) => {
        console.log('Client connected:', conn.peer);
        connections.push(conn);

        conn.on('open', () => {
            // Send current state to new player
            const playerId = conn.peer;
            ships[playerId] = createShip(playerId);

            // Assign color based on player count
            const colors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];
            ships[playerId].color = colors[Object.keys(ships).length % colors.length];

            conn.send({
                type: 'init',
                playerId: playerId,
                ships: ships,
                rocks: rocks,
                bullets: bullets,
                gameRunning: gameRunning
            });

            updatePlayerCount();

            // Notify other players
            broadcastState();
        });

        conn.on('data', (data) => {
            handleClientMessage(conn.peer, data);
        });

        conn.on('close', () => {
            console.log('Client disconnected:', conn.peer);
            connections = connections.filter(c => c !== conn);
            delete ships[conn.peer];
            updatePlayerCount();
            broadcastState();
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        document.getElementById('status').textContent = 'Error: ' + err.type;
    });
}

function setupClient(roomCode) {
    document.getElementById('join-status').textContent = 'Connecting...';

    peer = new Peer({
        debug: 1
    });

    peer.on('open', (id) => {
        console.log('Client peer opened with ID:', id);
        myId = id;

        hostConnection = peer.connect(roomCode, {
            reliable: true
        });

        hostConnection.on('open', () => {
            console.log('Connected to host');
            document.getElementById('join-status').textContent = 'Connected! Waiting for game...';
        });

        hostConnection.on('data', (data) => {
            handleHostMessage(data);
        });

        hostConnection.on('close', () => {
            console.log('Disconnected from host');
            document.getElementById('join-status').textContent = 'Disconnected from host';
            gameRunning = false;
        });

        hostConnection.on('error', (err) => {
            console.error('Connection error:', err);
            document.getElementById('join-status').textContent = 'Connection error';
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            document.getElementById('join-status').textContent = 'Room not found!';
        } else {
            document.getElementById('join-status').textContent = 'Error: ' + err.type;
        }
    });
}

function handleClientMessage(clientId, data) {
    if (data.type === 'input') {
        // Apply client input to their ship
        if (ships[clientId]) {
            if (data.shooting && Date.now() - (ships[clientId].lastShot || 0) > 200) {
                bullets.push(createBullet(ships[clientId]));
                ships[clientId].lastShot = Date.now();
            }
            // Store input for physics update
            ships[clientId].input = data;
        }
    }
}

function handleHostMessage(data) {
    if (data.type === 'init') {
        myId = data.playerId;
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;
        if (data.gameRunning) {
            startGame();
        }
    } else if (data.type === 'state') {
        // Update game state from host
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;
        updateHUD();
    } else if (data.type === 'start') {
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;
        startGame();
    }
}

function broadcastState() {
    const state = {
        type: 'state',
        ships: ships,
        rocks: rocks,
        bullets: bullets
    };

    connections.forEach(conn => {
        if (conn.open) {
            conn.send(state);
        }
    });
}

function sendInputToHost() {
    if (hostConnection && hostConnection.open) {
        hostConnection.send({
            type: 'input',
            left: keys.left,
            right: keys.right,
            up: keys.up,
            shooting: keys.space && Date.now() - lastShot > 200
        });

        if (keys.space && Date.now() - lastShot > 200) {
            lastShot = Date.now();
        }
    }
}

function updatePlayerCount() {
    const count = Object.keys(ships).length;
    document.getElementById('player-list').textContent = `Players: ${count}`;
    document.getElementById('hud-players').textContent = count;
}

// ============== GAME LOOP ==============
function startGame() {
    gameRunning = true;

    // Hide menu, show canvas
    document.getElementById('menu').classList.add('hidden');
    canvas.style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('controls-help').classList.remove('hidden');

    // Size canvas
    canvas.width = CONFIG.width;
    canvas.height = CONFIG.height;

    if (isHost) {
        // Create host ship if not exists
        if (!ships[myId]) {
            ships[myId] = createShip(myId);
        }

        // Spawn rocks
        spawnInitialRocks();

        // Notify clients
        connections.forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'start',
                    ships: ships,
                    rocks: rocks,
                    bullets: bullets
                });
            }
        });

        // Start network broadcast loop
        setInterval(() => {
            if (gameRunning) {
                broadcastState();
            }
        }, CONFIG.networkTickRate);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!gameRunning) return;

    update();
    render();

    requestAnimationFrame(gameLoop);
}

function update() {
    if (isHost) {
        // Host updates all game state
        // Update host's own ship
        if (ships[myId]) {
            if (keys.space && Date.now() - lastShot > 200) {
                bullets.push(createBullet(ships[myId]));
                lastShot = Date.now();
            }
            updateShip(ships[myId], keys);
        }

        // Update client ships based on their inputs
        Object.values(ships).forEach(ship => {
            if (ship.id !== myId && ship.input) {
                updateShip(ship, ship.input);
            }
        });

        // Update rocks
        rocks.forEach(updateRock);

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            updateBullet(bullets[i]);
            if (bullets[i].life <= 0) {
                bullets.splice(i, 1);
            }
        }

        // Check collisions
        checkCollisions();
    } else {
        // Client sends input to host
        sendInputToHost();

        // Client-side prediction (optional, for smoother feel)
        // We'll just render the state from host for simplicity
    }

    updateHUD();
}

function render() {
    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Draw stars (background)
    ctx.fillStyle = '#333';
    for (let i = 0; i < 100; i++) {
        const x = (i * 137) % CONFIG.width;
        const y = (i * 251) % CONFIG.height;
        ctx.fillRect(x, y, 1, 1);
    }

    // Draw rocks
    rocks.forEach(drawRock);

    // Draw bullets
    bullets.forEach(drawBullet);

    // Draw ships
    Object.values(ships).forEach(drawShip);
}

function updateHUD() {
    document.getElementById('hud-players').textContent = Object.keys(ships).length;
    document.getElementById('hud-rocks').textContent = rocks.length;
}

// ============== INPUT HANDLING ==============
function setupInput() {
    document.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
        if (e.code === 'Space') {
            keys.space = true;
            e.preventDefault();
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
        if (e.code === 'Space') keys.space = false;
    });
}

// ============== MENU SETUP ==============
function setupMenu() {
    document.getElementById('host-btn').addEventListener('click', () => {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('host-menu').classList.remove('hidden');
        setupHost();
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('join-menu').classList.remove('hidden');
    });

    document.getElementById('connect-btn').addEventListener('click', () => {
        const code = document.getElementById('room-input').value.toUpperCase().trim();
        if (code.length === 6) {
            setupClient(code);
        } else {
            document.getElementById('join-status').textContent = 'Please enter a 6-character code';
        }
    });

    document.getElementById('room-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('connect-btn').click();
        }
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        if (isHost) {
            startGame();
        }
    });

    document.getElementById('back-btn-host').addEventListener('click', () => {
        location.reload();
    });

    document.getElementById('back-btn-join').addEventListener('click', () => {
        location.reload();
    });
}

// ============== INIT ==============
function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');

    setupMenu();
    setupInput();
}

// Start when page loads
window.addEventListener('load', init);
