// ===========================================
// Lunar Defender - PeerJS Networking
// ===========================================

import { CONFIG, PlayerState } from './config.js';
import { createShip, randomColor } from './entities/ship.js';
import { createBullet } from './entities/projectiles.js';
import { GameEvents, createEvent, logEvent } from './stats.js';
import { registerRoom, unregisterRoom, startRoomUpdates, stopRoomUpdates } from './lobby.js';
import { getGameState } from './game.js';

let peer = null;
let connections = []; // For host: all client connections
let hostConnection = null; // For client: connection to host

// Callbacks to be set by game.js
let onStateUpdate = null;
let onGameStart = null;
let onEventReceived = null;

export function setPeerCallbacks(callbacks) {
    onStateUpdate = callbacks.onStateUpdate;
    onGameStart = callbacks.onGameStart;
    onEventReceived = callbacks.onEventReceived;
}

export function getPeer() {
    return peer;
}

export function getConnections() {
    return connections;
}

export function getHostConnection() {
    return hostConnection;
}

// ===========================================
// UTILITIES
// ===========================================

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

// ===========================================
// SHARING & INVITES
// ===========================================

export function getInviteUrl(roomCode) {
    const url = new URL(window.location.href);
    url.search = ''; // Clear existing params
    url.searchParams.set('join', roomCode);
    return url.toString();
}

export async function shareGame(roomCode) {
    const url = getInviteUrl(roomCode);
    const shareData = {
        title: 'Lunar Defender',
        text: `Join my game! Code: ${roomCode}`,
        url: url
    };

    const statusEl = document.getElementById('share-status');

    // Try native share first (mobile)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            if (statusEl) statusEl.textContent = 'Shared!';
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.log('Share failed, falling back to clipboard');
            }
        }
    }

    // Fallback: copy to clipboard
    try {
        await navigator.clipboard.writeText(url);
        if (statusEl) {
            statusEl.textContent = 'Link copied!';
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
        }
        return true;
    } catch (err) {
        // Final fallback: show URL
        if (statusEl) statusEl.textContent = url;
        return false;
    }
}

// ===========================================
// HOST SETUP
// ===========================================

// Track host info for lobby updates
let hostRoomCode = null;
let hostName = null;

export function setupHost(myName, myUserId, ships, onReady) {
    const roomCode = generateRoomCode();
    hostRoomCode = roomCode;
    hostName = myName;
    document.getElementById('room-code').textContent = roomCode;

    peer = new Peer(roomCode, {
        debug: 1
    });

    peer.on('open', async (id) => {
        console.log('Host peer opened with ID:', id);
        document.getElementById('status').textContent = 'Room ready! Tap INVITE to share.';

        // Register room in public lobby
        await registerRoom(roomCode, myName, 1);

        // Start periodic updates to keep room alive
        startRoomUpdates(roomCode, () => hostName, () => Object.keys(ships).length || 1);

        if (onReady) onReady(id, roomCode);
    });

    peer.on('connection', (conn) => {
        console.log('Client connected:', conn.peer);
        connections.push(conn);

        conn.on('open', () => {
            console.log('Client connection opened, waiting for join message...');
        });

        conn.on('data', (data) => {
            handleClientMessage(conn.peer, data, ships);
        });

        conn.on('close', () => {
            console.log('Client disconnected:', conn.peer);
            connections = connections.filter(c => c !== conn);
            delete ships[conn.peer];
            updatePlayerCount(ships);
            broadcastState(ships, [], []);
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        document.getElementById('status').textContent = 'Error: ' + err.type;
    });

    peer.on('close', () => {
        // Unregister from lobby when host closes
        stopRoomUpdates();
        if (hostRoomCode) {
            unregisterRoom(hostRoomCode);
            hostRoomCode = null;
        }
    });

    // Also unregister on page unload
    window.addEventListener('beforeunload', () => {
        stopRoomUpdates();
        if (hostRoomCode) {
            // Use sendBeacon for reliable unload
            unregisterRoom(hostRoomCode);
        }
    });

    return roomCode;
}

// ===========================================
// CLIENT SETUP
// ===========================================

export function setupClient(roomCode, myName, myUserId, onReady) {
    document.getElementById('join-status').textContent = 'Connecting...';

    peer = new Peer({
        debug: 1
    });

    peer.on('open', (id) => {
        console.log('Client peer opened with ID:', id);

        hostConnection = peer.connect(roomCode, {
            reliable: true
        });

        hostConnection.on('open', () => {
            console.log('Connected to host');
            document.getElementById('join-status').textContent = 'Connected! Waiting for game...';

            // Send our info to host
            hostConnection.send({
                type: 'join',
                name: myName,
                userId: myUserId
            });

            if (onReady) onReady(id);
        });

        hostConnection.on('data', (data) => {
            handleHostMessage(data);
        });

        hostConnection.on('close', () => {
            console.log('Disconnected from host');
            document.getElementById('join-status').textContent = 'Disconnected from host';
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

// ===========================================
// MESSAGE HANDLERS
// ===========================================

// Store references for message handling
let shipsRef = null;
let bulletsRef = null;
let rocksRef = null;
let thrustStartTimeRef = null;

export function setGameRefs(ships, bullets, rocks, thrustStartTime) {
    shipsRef = ships;
    bulletsRef = bullets;
    rocksRef = rocks;
    thrustStartTimeRef = thrustStartTime;
}

function handleClientMessage(clientId, data, ships) {
    if (data.type === 'join') {
        // Create ship for new player with their name
        const colors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];
        const color = colors[Object.keys(ships).length % colors.length];
        ships[clientId] = createShip(clientId, null, null, color, data.name);

        // Send current state to new player
        const conn = connections.find(c => c.peer === clientId);
        if (conn && conn.open) {
            const gameState = getGameState();
            conn.send({
                type: 'init',
                playerId: clientId,
                ships: ships,
                rocks: rocksRef || [],
                bullets: bulletsRef || [],
                gameRunning: gameState.gameRunning
            });
        }

        updatePlayerCount(ships);
        broadcastState(ships, rocksRef || [], bulletsRef || []);
    } else if (data.type === 'input') {
        // Apply client input to their ship
        if (ships[clientId]) {
            if (data.shooting && Date.now() - (ships[clientId].lastShot || 0) > 200) {
                if (bulletsRef) {
                    bulletsRef.push(createBullet(ships[clientId]));
                }
                ships[clientId].lastShot = Date.now();
                broadcastEvent(createEvent(GameEvents.SHOT_FIRED, { playerId: clientId }));
            }

            // Track thrust start/stop
            if (data.up && thrustStartTimeRef && !thrustStartTimeRef[clientId]) {
                thrustStartTimeRef[clientId] = Date.now();
                broadcastEvent(createEvent(GameEvents.THRUST_START, { playerId: clientId }));
            } else if (!data.up && thrustStartTimeRef && thrustStartTimeRef[clientId]) {
                const duration = (Date.now() - thrustStartTimeRef[clientId]) / 1000;
                if (ships[clientId]?.stats) {
                    ships[clientId].stats.fuelUsed += duration * CONFIG.fuelPerThrust * 60;
                }
                delete thrustStartTimeRef[clientId];
                broadcastEvent(createEvent(GameEvents.THRUST_STOP, { playerId: clientId }));
            }
            // Store input for physics update
            ships[clientId].input = data;
        }
    }
}

function handleHostMessage(data) {
    if (data.type === 'init') {
        if (onStateUpdate) {
            onStateUpdate(data.playerId, data.ships, data.rocks, data.bullets);
        }
        if (data.gameRunning && onGameStart) {
            onGameStart();
        }
    } else if (data.type === 'state') {
        if (onStateUpdate) {
            onStateUpdate(null, data.ships, data.rocks, data.bullets);
        }
    } else if (data.type === 'start') {
        if (onStateUpdate) {
            onStateUpdate(null, data.ships, data.rocks, data.bullets);
        }
        if (onGameStart) {
            onGameStart();
        }
    } else if (data.type === 'event') {
        // Handle game events from host
        if (onEventReceived) {
            onEventReceived(data.event);
        }
    }
}

// ===========================================
// BROADCASTING
// ===========================================

export function broadcastState(ships, rocks, bullets) {
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

export function broadcastEvent(event) {
    logEvent(event);

    // Handle event locally
    if (onEventReceived) {
        onEventReceived(event);
    }

    // Send to all clients
    connections.forEach(conn => {
        if (conn.open) {
            conn.send({ type: 'event', event });
        }
    });
}

export function broadcastGameStart(ships, rocks, bullets) {
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
}

export function sendInputToHost(keys, lastShot, lastAltFire) {
    if (hostConnection && hostConnection.open) {
        hostConnection.send({
            type: 'input',
            left: keys.left,
            right: keys.right,
            up: keys.up,
            shooting: keys.space && Date.now() - lastShot > 200,
            altFire: keys.altFire && Date.now() - lastAltFire > 300
        });

        const newLastShot = (keys.space && Date.now() - lastShot > 200) ? Date.now() : lastShot;
        const newLastAltFire = (keys.altFire && Date.now() - lastAltFire > 300) ? Date.now() : lastAltFire;
        return { lastShot: newLastShot, lastAltFire: newLastAltFire };
    }
    return { lastShot, lastAltFire };
}

export function updatePlayerCount(ships) {
    const count = Object.keys(ships).length;
    document.getElementById('player-list').textContent = `Players: ${count}`;
    document.getElementById('hud-players').textContent = count;
}

// ===========================================
// AUTO-JOIN CHECK
// ===========================================

export function checkAutoJoin(setupClientFn) {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');

    if (joinCode && joinCode.length === 6) {
        console.log('Auto-joining room:', joinCode);

        // Switch to join menu and fill in code
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('join-menu').classList.remove('hidden');
        document.getElementById('room-input').value = joinCode.toUpperCase();

        // Auto-connect after a short delay
        setTimeout(() => {
            setupClientFn(joinCode.toUpperCase());
        }, 500);

        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);

        return true;
    }
    return false;
}
