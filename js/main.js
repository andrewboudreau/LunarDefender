// ===========================================
// Lunar Defender - Main Entry Point
// ===========================================

import { loadLifetimeStats } from './stats.js';
import { setupHost, setupClient, checkAutoJoin, setPeerCallbacks } from './network.js';
import { setupInput } from './input.js';
import { setupMenu, setupFullscreen, resizeCanvas, getOrCreateUserId, getPlayerName, generateNickname } from './ui.js';
import { setCanvas, setGameState, setLifetimeStats, startGame, saveCurrentStats, handleGameEvent, getShips, getGameState, getWorldSeed, setWorldSeed } from './game.js';
import { initStarfield, updateStarfield, renderStarfield } from './starfield.js';
import { CONFIG } from './config.js';

// ===========================================
// GLOBAL STATE
// ===========================================

let myId = null;
let myUserId = null;
let myName = null;
let currentRoomCode = null;
let isHost = false;
let myLifetimeStats = null;
let menuBackgroundRunning = true;

// ===========================================
// MENU BACKGROUND
// ===========================================

function startMenuBackground(canvas) {
    const ctx = canvas.getContext('2d');

    // Size canvas to fill window
    function resizeMenuCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeMenuCanvas();
    window.addEventListener('resize', () => {
        if (menuBackgroundRunning) resizeMenuCanvas();
    });

    // Initialize starfield with a fixed seed for menu
    initStarfield(42);

    // Menu stars - simple drifting parallax effect
    const menuStars = [];
    const rand = mulberry32(42);

    // Create stars at different depths
    for (let i = 0; i < 200; i++) {
        menuStars.push({
            x: rand() * canvas.width,
            y: rand() * canvas.height,
            size: 0.5 + rand() * 0.5,
            brightness: 0.2 + rand() * 0.3,
            speed: 0.1 + rand() * 0.2,
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.02 + rand() * 0.03
        });
    }
    for (let i = 0; i < 100; i++) {
        const colorRoll = rand();
        menuStars.push({
            x: rand() * canvas.width,
            y: rand() * canvas.height,
            size: 0.8 + rand() * 1.2,
            brightness: 0.4 + rand() * 0.3,
            speed: 0.3 + rand() * 0.4,
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.01 + rand() * 0.02,
            color: colorRoll > 0.8 ? '#aaf' : (colorRoll > 0.5 ? '#ffa' : '#fff')
        });
    }
    for (let i = 0; i < 40; i++) {
        const colorRoll = rand();
        menuStars.push({
            x: rand() * canvas.width,
            y: rand() * canvas.height,
            size: 1.5 + rand() * 2,
            brightness: 0.6 + rand() * 0.4,
            speed: 0.6 + rand() * 0.6,
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.005 + rand() * 0.01,
            glow: true,
            color: colorRoll > 0.7 ? '#8af' : (colorRoll > 0.5 ? '#fa8' : '#fff')
        });
    }

    // Nebulas - slowly evolving gaseous clouds
    const nebulas = [];
    const nebulaColors = [
        { r: 80, g: 40, b: 120 },   // Purple
        { r: 40, g: 60, b: 100 },   // Blue
        { r: 100, g: 50, b: 70 },   // Magenta
        { r: 40, g: 80, b: 80 },    // Teal
        { r: 70, g: 40, b: 50 }     // Dark red
    ];
    for (let i = 0; i < 5; i++) {
        const color = nebulaColors[Math.floor(rand() * nebulaColors.length)];
        nebulas.push({
            x: rand() * canvas.width,
            y: rand() * canvas.height,
            radius: 150 + rand() * 300,
            color: color,
            opacity: 0.015 + rand() * 0.025,
            speed: 0.05 + rand() * 0.1,
            pulse: rand() * Math.PI * 2,
            pulseSpeed: 0.005 + rand() * 0.01
        });
    }

    // Background ships
    const bgShips = [];
    const shipColors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];

    function spawnShip() {
        if (bgShips.length < 3 && Math.random() < 0.005) {
            const fromRight = Math.random() > 0.5;
            bgShips.push({
                x: fromRight ? canvas.width + 50 : -50,
                y: 100 + Math.random() * (canvas.height - 200),
                angle: fromRight ? Math.PI + (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.5,
                speed: 1 + Math.random() * 2,
                color: shipColors[Math.floor(Math.random() * shipColors.length)],
                size: 0.3 + Math.random() * 0.4,
                thrustFlicker: 0
            });
        }
    }

    // Gravitational lenses
    const lenses = [];
    function spawnLens() {
        if (lenses.length < 2 && Math.random() < 0.002) {
            lenses.push({
                x: -100,
                y: 100 + Math.random() * (canvas.height - 200),
                radius: 40 + Math.random() * 60,
                speed: 0.3 + Math.random() * 0.5,
                intensity: 0.3 + Math.random() * 0.4
            });
        }
    }

    function renderMenuBackground() {
        if (!menuBackgroundRunning) return;

        // Clear
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw nebulas (behind everything)
        for (const neb of nebulas) {
            neb.x -= neb.speed;
            if (neb.x < -neb.radius * 2) neb.x = canvas.width + neb.radius * 2;

            neb.pulse += neb.pulseSpeed;
            const pulseScale = 1 + Math.sin(neb.pulse) * 0.1;
            const currentRadius = neb.radius * pulseScale;

            const gradient = ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, currentRadius);
            gradient.addColorStop(0, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity})`);
            gradient.addColorStop(0.4, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity * 0.6})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(neb.x, neb.y, currentRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Update and draw menu stars with parallax drift
        for (const star of menuStars) {
            star.x -= star.speed;
            if (star.x < -10) star.x = canvas.width + 10;

            star.twinkle += star.twinkleSpeed;
            const twinkleBrightness = star.brightness * (0.7 + 0.3 * Math.sin(star.twinkle));

            ctx.globalAlpha = twinkleBrightness;

            if (star.glow) {
                ctx.shadowColor = star.color || '#fff';
                ctx.shadowBlur = star.size * 4;
            }

            ctx.fillStyle = star.color || '#fff';
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;

        // Draw gravitational lenses
        spawnLens();
        for (let i = lenses.length - 1; i >= 0; i--) {
            const lens = lenses[i];
            lens.x += lens.speed;

            if (lens.x > canvas.width + lens.radius * 2) {
                lenses.splice(i, 1);
                continue;
            }

            // Draw lens distortion effect (concentric rings with offset)
            ctx.save();
            for (let r = lens.radius; r > 5; r -= 8) {
                const distort = (lens.radius - r) / lens.radius * lens.intensity * 3;
                ctx.strokeStyle = `rgba(150, 180, 255, ${0.03 * (r / lens.radius)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(lens.x + distort, lens.y + distort * 0.5, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            // Bright center point
            ctx.fillStyle = `rgba(200, 220, 255, ${lens.intensity * 0.3})`;
            ctx.beginPath();
            ctx.arc(lens.x, lens.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Draw background ships
        spawnShip();
        for (let i = bgShips.length - 1; i >= 0; i--) {
            const ship = bgShips[i];
            ship.x += Math.cos(ship.angle) * ship.speed;
            ship.y += Math.sin(ship.angle) * ship.speed;
            ship.thrustFlicker++;

            // Remove if off screen
            if (ship.x < -100 || ship.x > canvas.width + 100 ||
                ship.y < -100 || ship.y > canvas.height + 100) {
                bgShips.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(ship.x, ship.y);
            ctx.rotate(ship.angle);
            ctx.scale(ship.size, ship.size);
            ctx.globalAlpha = 0.6;

            // Ship body
            ctx.strokeStyle = ship.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(-10, -10);
            ctx.lineTo(-5, 0);
            ctx.lineTo(-10, 10);
            ctx.closePath();
            ctx.stroke();

            // Thrust flame
            ctx.strokeStyle = '#f80';
            ctx.shadowColor = '#f80';
            ctx.shadowBlur = 10;
            const flameLength = 15 + Math.sin(ship.thrustFlicker * 0.5) * 8 + Math.random() * 5;
            ctx.beginPath();
            ctx.moveTo(-5, -5);
            ctx.lineTo(-5 - flameLength, 0);
            ctx.lineTo(-5, 5);
            ctx.stroke();

            // Inner bright flame
            ctx.strokeStyle = '#ff0';
            ctx.beginPath();
            ctx.moveTo(-5, -3);
            ctx.lineTo(-5 - flameLength * 0.6, 0);
            ctx.lineTo(-5, 3);
            ctx.stroke();

            ctx.restore();
        }

        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;

        requestAnimationFrame(renderMenuBackground);
    }

    renderMenuBackground();
}

// Simple seeded RNG for menu stars
function mulberry32(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function stopMenuBackground() {
    menuBackgroundRunning = false;
}

// ===========================================
// INITIALIZATION
// ===========================================

function init() {
    const canvas = document.getElementById('game');

    // Set canvas in game module
    setCanvas(canvas);

    // Start menu background starfield
    startMenuBackground(canvas);

    // Initialize user identity
    myUserId = getOrCreateUserId();
    myName = getPlayerName();
    myLifetimeStats = loadLifetimeStats();
    console.log('User ID:', myUserId, 'Name:', myName);
    console.log('Lifetime stats:', myLifetimeStats);

    // Set lifetime stats in game module
    setLifetimeStats(myLifetimeStats);

    // Setup peer callbacks for network module
    setPeerCallbacks({
        onStateUpdate: (playerId, ships, rocks, bullets) => {
            const state = { ships, rocks, bullets };
            if (playerId) {
                myId = playerId;
                state.myId = playerId;
            }
            setGameState(state);
        },
        onGameStart: () => {
            stopMenuBackground();
            startGame();
        },
        onEventReceived: (event) => {
            handleGameEvent(event);
        },
        getGameRunning: () => {
            return getGameState().gameRunning;
        },
        getWorldSeed: getWorldSeed,
        setWorldSeed: setWorldSeed
    });

    // Save stats periodically and on page unload
    setInterval(saveCurrentStats, 30000);
    window.addEventListener('beforeunload', saveCurrentStats);

    // Setup menu
    setupMenu({
        onHost: () => {
            isHost = true;
            setGameState({ isHost: true, myUserId, myName });

            currentRoomCode = setupHost(myName, myUserId, getShips(), (id, roomCode) => {
                myId = id;
                currentRoomCode = roomCode;
                setGameState({ myId: id, currentRoomCode: roomCode });
            });
        },
        onJoin: () => {
            // Just switches to join menu, handled by connect
        },
        onConnect: (code) => {
            setGameState({ myUserId, myName });

            setupClient(code, myName, myUserId, (id) => {
                myId = id;
                currentRoomCode = code;
                setGameState({ myId: id, currentRoomCode: code });
            });
        },
        onStartGame: () => {
            if (isHost) {
                stopMenuBackground();
                startGame();
            }
        },
        getCurrentRoomCode: () => currentRoomCode,
        getMyName: () => myName,
        setMyName: (name) => {
            myName = name;
            setGameState({ myName: name });
        }
    });

    // Check for auto-join link
    if (checkAutoJoin((code) => {
        setGameState({ myUserId, myName });
        setupClient(code, myName, myUserId, (id) => {
            myId = id;
            currentRoomCode = code;
            setGameState({ myId: id, currentRoomCode: code });
        });
    })) {
        setupInput();
        setupFullscreen(() => {
            const gameState = getGameState();
            if (gameState.gameRunning) resizeCanvas(canvas);
        });
        return;
    }

    setupInput();
    setupFullscreen(() => {
        const gameState = getGameState();
        if (gameState.gameRunning) resizeCanvas(canvas);
    });

    // Check for bot mode via URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('bot') === 'true') {
        setGameState({ isBot: true });
        myName = 'Bot_' + generateNickname();
        setGameState({ myName });
        console.log('Bot mode enabled - auto-hosting as', myName);

        // Auto-start as host with bot
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('host-menu').classList.remove('hidden');

        isHost = true;
        setGameState({ isHost: true, myUserId, myName });

        currentRoomCode = setupHost(myName, myUserId, getShips(), (id, roomCode) => {
            myId = id;
            currentRoomCode = roomCode;
            setGameState({ myId: id, currentRoomCode: roomCode });

            document.getElementById('status').textContent = 'Bot hosting! Join with the code above.';
            stopMenuBackground();
            startGame();
        });
    }
}

// Start when page loads
window.addEventListener('load', init);
