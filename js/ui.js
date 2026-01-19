// ===========================================
// Lunar Defender - UI & Identity Management
// ===========================================

import { CONFIG } from './config.js';
import { ADJECTIVES, NOUNS } from './config.js';
import { playClick } from './audio.js';
import { loadLifetimeStats, saveLifetimeStats } from './stats.js';
import { shareGame } from './network.js';

// ===========================================
// USER IDENTITY
// ===========================================

export function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
}

export function generateNickname() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
}

export function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

export function getOrCreateUserId() {
    let userId = getCookie('lunar_user_id');
    if (!userId) {
        userId = generateUserId();
        setCookie('lunar_user_id', userId);
    }
    return userId;
}

export function getDisplayName() {
    return getCookie('lunar_display_name') || null;
}

export function setDisplayName(name) {
    setCookie('lunar_display_name', name.trim().substring(0, 20));
}

export function getPlayerName() {
    let name = getDisplayName();
    if (!name) {
        name = generateNickname();
        setDisplayName(name);
    }
    return name;
}

// ===========================================
// CANVAS & FULLSCREEN
// ===========================================

export function resizeCanvas(canvas) {
    // The CSS handles the visual scaling, canvas stays at logical resolution
    canvas.width = CONFIG.width;
    canvas.height = CONFIG.height;
}

export function toggleFullscreen() {
    const elem = document.documentElement;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Enter fullscreen
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }

        // Lock to landscape on mobile if supported
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

export function setupFullscreen(onResize) {
    const btn = document.getElementById('fullscreen-btn');
    btn.addEventListener('click', toggleFullscreen);

    // Update button icon based on fullscreen state
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

    // Resize canvas when orientation/screen changes
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(onResize, 100);
    });
}

function updateFullscreenButton() {
    const btn = document.getElementById('fullscreen-btn');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        btn.textContent = '⛶';
        btn.title = 'Exit Fullscreen';
    } else {
        btn.textContent = '⛶';
        btn.title = 'Fullscreen';
    }
}

// ===========================================
// HUD UPDATES
// ===========================================

export function updateHUD(ships, rocks, myId) {
    document.getElementById('hud-players').textContent = Object.keys(ships).length;
    document.getElementById('hud-rocks').textContent = rocks.length;

    // Update my stats display
    const myShip = ships[myId];
    if (myShip && myShip.stats) {
        document.getElementById('hud-hits').textContent = myShip.stats.rocksDestroyed;
        document.getElementById('hud-shots').textContent = myShip.stats.shotsFired;
        document.getElementById('hud-fuel').textContent = Math.floor(myShip.stats.fuelUsed);
    }
}

export function updateMenuStats(lifetimeStats) {
    if (lifetimeStats) {
        const rocksEl = document.getElementById('stat-rocks');
        const shotsEl = document.getElementById('stat-shots');
        const gamesEl = document.getElementById('stat-games');
        if (rocksEl) rocksEl.textContent = lifetimeStats.rocksDestroyed || 0;
        if (shotsEl) shotsEl.textContent = lifetimeStats.shotsFired || 0;
        if (gamesEl) gamesEl.textContent = lifetimeStats.gamesPlayed || 0;
    }
}

// ===========================================
// MENU SETUP
// ===========================================

export function setupMenu(callbacks) {
    const {
        onHost,
        onJoin,
        onConnect,
        onStartGame,
        getCurrentRoomCode,
        getMyName,
        setMyName
    } = callbacks;

    // Pre-fill name input with stored name
    const nameInput = document.getElementById('player-name');
    const storedName = getDisplayName();
    if (storedName) {
        nameInput.value = storedName;
    } else {
        nameInput.placeholder = generateNickname();
    }

    // Display lifetime stats
    const lifetimeStats = loadLifetimeStats();
    updateMenuStats(lifetimeStats);

    // Save name on change (with debounce)
    let nameTimeout;
    nameInput.addEventListener('input', () => {
        clearTimeout(nameTimeout);
        nameTimeout = setTimeout(() => {
            const name = nameInput.value.trim();
            if (name) {
                setDisplayName(name);
                setMyName(name);
            }
        }, 500);
    });

    document.getElementById('host-btn').addEventListener('click', () => {
        playClick();
        // Save name before hosting
        const name = nameInput.value.trim() || nameInput.placeholder;
        setDisplayName(name);
        setMyName(name);

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('host-menu').classList.remove('hidden');
        onHost();
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        playClick();
        // Save name before joining
        const name = nameInput.value.trim() || nameInput.placeholder;
        setDisplayName(name);
        setMyName(name);

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('join-menu').classList.remove('hidden');
    });

    document.getElementById('connect-btn').addEventListener('click', () => {
        playClick();
        const code = document.getElementById('room-input').value.toUpperCase().trim();
        if (code.length === 6) {
            onConnect(code);
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
        playClick();
        onStartGame();
    });

    document.getElementById('back-btn-host').addEventListener('click', () => {
        location.reload();
    });

    document.getElementById('back-btn-join').addEventListener('click', () => {
        location.reload();
    });

    // Share buttons
    document.getElementById('share-btn').addEventListener('click', () => {
        playClick();
        const roomCode = getCurrentRoomCode();
        if (roomCode) {
            shareGame(roomCode);
        }
    });

    document.getElementById('ingame-invite-btn').addEventListener('click', () => {
        playClick();
        const roomCode = getCurrentRoomCode();
        if (roomCode) {
            shareGame(roomCode);
        }
    });
}

// ===========================================
// GAME UI TRANSITIONS
// ===========================================

export function showGameUI(isHost, roomCode) {
    // Hide menu, show game
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('game-wrapper').style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('controls-help').classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');
    document.getElementById('fullscreen-btn').style.display = 'block';

    // Show in-game invite button for host
    if (isHost && roomCode) {
        document.getElementById('ingame-invite-btn').style.display = 'block';
    }
}
