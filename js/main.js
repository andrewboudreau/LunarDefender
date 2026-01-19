// ===========================================
// Lunar Defender - Main Entry Point
// ===========================================

import { loadLifetimeStats } from './stats.js';
import { setupHost, setupClient, checkAutoJoin, setPeerCallbacks } from './network.js';
import { setupInput } from './input.js';
import { setupMenu, setupFullscreen, resizeCanvas, getOrCreateUserId, getPlayerName, generateNickname } from './ui.js';
import { setCanvas, setGameState, setLifetimeStats, startGame, saveCurrentStats, handleGameEvent, getShips, getGameState } from './game.js';

// ===========================================
// GLOBAL STATE
// ===========================================

let myId = null;
let myUserId = null;
let myName = null;
let currentRoomCode = null;
let isHost = false;
let myLifetimeStats = null;

// ===========================================
// INITIALIZATION
// ===========================================

function init() {
    const canvas = document.getElementById('game');

    // Set canvas in game module
    setCanvas(canvas);

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
            startGame();
        },
        onEventReceived: (event) => {
            handleGameEvent(event);
        }
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
            startGame();
        });
    }
}

// Start when page loads
window.addEventListener('load', init);
