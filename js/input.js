// ===========================================
// Lunar Defender - Input Handling
// ===========================================

import { getLanderState, setLanderState } from './mining.js';

// Local input state
let keys = {
    left: false,
    right: false,
    up: false,
    space: false,
    mine: false,    // E key for mining
    altFire: false  // Q key for secondary weapons
};

let exitMiningCallback = null;

export function getKeys() {
    return keys;
}

export function setExitMiningCallback(callback) {
    exitMiningCallback = callback;
}

export function setupInput() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
        if (e.code === 'KeyE') keys.mine = true;
        if (e.code === 'KeyQ') keys.altFire = true;
        if (e.code === 'Space') {
            keys.space = true;
            e.preventDefault();

            // Handle lander exit
            const landerState = getLanderState();
            if (landerState && landerState.status !== 'active') {
                const success = landerState.status === 'landed';
                if (exitMiningCallback) {
                    exitMiningCallback(success, landerState.reward);
                }
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
        if (e.code === 'KeyE') keys.mine = false;
        if (e.code === 'KeyQ') keys.altFire = false;
        if (e.code === 'Space') keys.space = false;
    });

    // Touch controls
    setupTouchButton('left-btn', 'left');
    setupTouchButton('right-btn', 'right');
    setupTouchButton('thrust-btn', 'up');
    setupTouchButton('fire-btn', 'space');
    setupTouchButton('mine-btn', 'mine');
}

function setupTouchButton(btnId, key) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const activate = (e) => {
        e.preventDefault();
        keys[key] = true;
        btn.classList.add('active');
    };

    const deactivate = (e) => {
        e.preventDefault();
        keys[key] = false;
        btn.classList.remove('active');
    };

    btn.addEventListener('touchstart', activate, { passive: false });
    btn.addEventListener('touchend', deactivate, { passive: false });
    btn.addEventListener('touchcancel', deactivate, { passive: false });

    // Also support mouse for testing
    btn.addEventListener('mousedown', activate);
    btn.addEventListener('mouseup', deactivate);
    btn.addEventListener('mouseleave', deactivate);
}
