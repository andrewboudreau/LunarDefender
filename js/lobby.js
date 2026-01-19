// ===========================================
// Lunar Defender - Public Lobby System
// Uses Azure Blob Storage for room discovery
// ===========================================

const BLOB_BASE = 'https://belongtouspublic.blob.core.windows.net/lunardefender';
const SAS_TOKEN = 'sp=raw&st=2026-01-19T06:00:41Z&se=2027-01-09T14:15:41Z&spr=https&sv=2024-11-04&sr=c&sig=U1R%2F%2BqUBUl4u7UPVmWyPyY85V2rHCCz81ryAQchfUjE%3D';
const LOBBY_FILE = 'lobby.json';
const ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const UPDATE_INTERVAL_MS = 30 * 1000; // 30 seconds

let currentETag = null;
let updateIntervalId = null;

function getLobbyUrl() {
    return `${BLOB_BASE}/${LOBBY_FILE}?${SAS_TOKEN}`;
}

// Sanitize text to prevent abuse - only allow safe characters
function sanitize(text, maxLength = 20) {
    if (!text || typeof text !== 'string') return 'Unknown';
    // Only allow alphanumeric, spaces, and basic punctuation
    return text.replace(/[^a-zA-Z0-9 _-]/g, '').substring(0, maxLength) || 'Unknown';
}

// Validate room entry structure
function isValidRoom(room) {
    return room &&
        typeof room.code === 'string' && /^[A-Z0-9]{6}$/.test(room.code) &&
        typeof room.host === 'string' &&
        typeof room.players === 'number' && room.players >= 1 && room.players <= 10 &&
        typeof room.ts === 'number';
}

// Fetch current lobby state
export async function fetchLobby() {
    try {
        const response = await fetch(getLobbyUrl(), {
            method: 'GET',
            headers: {
                'x-ms-blob-type': 'BlockBlob'
            }
        });

        if (response.status === 404) {
            // File doesn't exist yet, return empty lobby
            currentETag = null;
            return { rooms: [] };
        }

        if (!response.ok) {
            console.warn('Failed to fetch lobby:', response.status);
            return { rooms: [] };
        }

        // Store ETag for optimistic concurrency
        currentETag = response.headers.get('ETag');

        const data = await response.json();

        // Validate and sanitize rooms, filter out stale ones
        const now = Date.now();
        const validRooms = (data.rooms || [])
            .filter(room => isValidRoom(room) && (now - room.ts) < ROOM_TIMEOUT_MS)
            .map(room => ({
                code: room.code,
                host: sanitize(room.host),
                players: Math.min(10, Math.max(1, room.players)),
                ts: room.ts
            }));

        return { rooms: validRooms };
    } catch (err) {
        console.warn('Error fetching lobby:', err);
        return { rooms: [] };
    }
}

// Update lobby with new room list
async function updateLobby(rooms) {
    const data = { rooms };
    const body = JSON.stringify(data);

    // Enforce size limit (10KB)
    if (body.length > 10240) {
        console.warn('Lobby data too large, trimming oldest rooms');
        rooms.sort((a, b) => b.ts - a.ts);
        rooms.length = Math.floor(rooms.length * 0.8);
        return updateLobby(rooms);
    }

    try {
        const headers = {
            'Content-Type': 'application/json',
            'x-ms-blob-type': 'BlockBlob'
        };

        // Use ETag for optimistic concurrency if we have one
        if (currentETag) {
            headers['If-Match'] = currentETag;
        }

        const response = await fetch(getLobbyUrl(), {
            method: 'PUT',
            headers,
            body
        });

        if (response.status === 412) {
            // ETag mismatch - someone else updated, retry
            console.log('Lobby conflict, retrying...');
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            return null; // Signal retry needed
        }

        if (!response.ok) {
            console.warn('Failed to update lobby:', response.status);
            return false;
        }

        currentETag = response.headers.get('ETag');
        return true;
    } catch (err) {
        console.warn('Error updating lobby:', err);
        return false;
    }
}

// Register a room in the lobby
export async function registerRoom(code, hostName, playerCount = 1) {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        const lobby = await fetchLobby();

        // Remove any existing entry for this room code
        const rooms = lobby.rooms.filter(r => r.code !== code);

        // Add our room
        rooms.push({
            code: code,
            host: sanitize(hostName),
            players: Math.min(10, Math.max(1, playerCount)),
            ts: Date.now()
        });

        const result = await updateLobby(rooms);
        if (result === true) {
            console.log('Room registered in lobby:', code);
            return true;
        }
        if (result === false) {
            return false; // Real error, don't retry
        }
        // null means retry
    }

    console.warn('Failed to register room after retries');
    return false;
}

// Update room player count (call periodically to keep room alive)
export async function updateRoom(code, hostName, playerCount) {
    return registerRoom(code, hostName, playerCount);
}

// Remove a room from the lobby
export async function unregisterRoom(code) {
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        const lobby = await fetchLobby();
        const rooms = lobby.rooms.filter(r => r.code !== code);

        // Only update if we actually removed something
        if (rooms.length === lobby.rooms.length) {
            return true; // Room wasn't there anyway
        }

        const result = await updateLobby(rooms);
        if (result === true) {
            console.log('Room unregistered from lobby:', code);
            return true;
        }
        if (result === false) {
            return false;
        }
    }

    return false;
}

// Start periodic room updates (keeps room alive and updates player count)
export function startRoomUpdates(code, getHostName, getPlayerCount) {
    stopRoomUpdates(); // Clear any existing interval

    updateIntervalId = setInterval(async () => {
        await updateRoom(code, getHostName(), getPlayerCount());
    }, UPDATE_INTERVAL_MS);
}

// Stop periodic updates
export function stopRoomUpdates() {
    if (updateIntervalId) {
        clearInterval(updateIntervalId);
        updateIntervalId = null;
    }
}

// Get list of available rooms (for join screen)
export async function getAvailableRooms() {
    const lobby = await fetchLobby();
    return lobby.rooms.sort((a, b) => b.ts - a.ts); // Newest first
}
