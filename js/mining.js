// ===========================================
// Lunar Defender - Lunar Lander Mining Mini-Game
// ===========================================

import { CONFIG, LANDER_CONFIG, PlayerState } from './config.js';
import { startThrust, stopThrust, playSuccess, playCrash } from './audio.js';
import { getRandomUpgrade } from './upgrades.js';

let landerState = null;

export function getLanderState() {
    return landerState;
}

export function setLanderState(state) {
    landerState = state;
}

export function createLanderState(rockId) {
    // Generate terrain
    const terrain = generateTerrain();

    return {
        rockId: rockId,
        x: CONFIG.width / 2,
        y: 80,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,  // Pointing up
        fuel: LANDER_CONFIG.maxFuel,
        terrain: terrain.points,
        landingPads: terrain.pads,
        status: 'active',     // 'active', 'landed', 'crashed'
        reward: null,
        thrustOn: false
    };
}

function generateTerrain() {
    const points = [];
    const pads = [];
    const segmentWidth = CONFIG.width / LANDER_CONFIG.terrainSegments;
    let y = CONFIG.height - 100;

    // Decide which segments have landing pads
    const padSegments = [];
    while (padSegments.length < LANDER_CONFIG.landingPadCount) {
        const seg = 3 + Math.floor(Math.random() * (LANDER_CONFIG.terrainSegments - 6));
        if (!padSegments.includes(seg) && !padSegments.includes(seg - 1) && !padSegments.includes(seg + 1)) {
            padSegments.push(seg);
        }
    }

    for (let i = 0; i <= LANDER_CONFIG.terrainSegments; i++) {
        const x = i * segmentWidth;

        if (padSegments.includes(i)) {
            // Landing pad - flat section
            const padY = y;
            points.push({ x, y: padY });
            points.push({ x: x + segmentWidth, y: padY });
            pads.push({ x, y: padY, width: segmentWidth });
            i++; // Skip next segment (pad takes 2)
        } else {
            // Jagged terrain
            y += (Math.random() - 0.4) * 40;
            y = Math.max(CONFIG.height - 200, Math.min(CONFIG.height - 50, y));
            points.push({ x, y });
        }
    }

    return { points, pads };
}

export function updateLander(keys) {
    if (!landerState || landerState.status !== 'active') return;

    const L = landerState;

    // Gravity
    L.vy += LANDER_CONFIG.gravity;

    // Rotation
    if (keys.left) L.angle -= LANDER_CONFIG.rotSpeed;
    if (keys.right) L.angle += LANDER_CONFIG.rotSpeed;

    // Thrust
    const wasThrusting = L.thrustOn;
    L.thrustOn = keys.up && L.fuel > 0;
    if (L.thrustOn) {
        L.vx += Math.cos(L.angle) * LANDER_CONFIG.thrust;
        L.vy += Math.sin(L.angle) * LANDER_CONFIG.thrust;
        L.fuel -= LANDER_CONFIG.fuelUsage;
        if (!wasThrusting) startThrust();
    } else if (wasThrusting) {
        stopThrust();
    }

    // Move
    L.x += L.vx;
    L.y += L.vy;

    // Screen bounds (wrap horizontally)
    if (L.x < 0) L.x = CONFIG.width;
    if (L.x > CONFIG.width) L.x = 0;

    // Check terrain collision
    const terrainY = getTerrainHeight(L.x, L.terrain);
    if (L.y >= terrainY - 10) {
        const speed = Math.sqrt(L.vx * L.vx + L.vy * L.vy);
        const angleFromVertical = Math.abs(L.angle + Math.PI / 2);
        const onPad = isOnLandingPad(L.x, L.landingPads);

        stopThrust(); // Stop any thrust sound
        if (onPad && speed < LANDER_CONFIG.maxLandingSpeed && angleFromVertical < LANDER_CONFIG.maxLandingAngle) {
            // SUCCESS!
            L.status = 'landed';
            L.reward = getRandomUpgrade();
            L.y = terrainY - 10;
            L.vx = 0;
            L.vy = 0;
            playSuccess();
        } else {
            // CRASH!
            L.status = 'crashed';
            playCrash();
        }
    }

    // Out of bounds top - just cap it
    if (L.y < 20) {
        L.y = 20;
        L.vy = Math.max(0, L.vy);
    }
}

function getTerrainHeight(x, terrain) {
    // Find the two terrain points we're between
    for (let i = 0; i < terrain.length - 1; i++) {
        if (x >= terrain[i].x && x <= terrain[i + 1].x) {
            // Linear interpolation
            const t = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
            return terrain[i].y + t * (terrain[i + 1].y - terrain[i].y);
        }
    }
    return CONFIG.height - 50;
}

function isOnLandingPad(x, pads) {
    for (const pad of pads) {
        if (x >= pad.x && x <= pad.x + pad.width) {
            return true;
        }
    }
    return false;
}

export function renderLander(ctx) {
    if (!landerState) return;

    const L = landerState;

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Stars
    ctx.fillStyle = '#333';
    for (let i = 0; i < 80; i++) {
        const sx = (i * 137 + 50) % CONFIG.width;
        const sy = (i * 251 + 30) % (CONFIG.height - 200);
        ctx.fillRect(sx, sy, 1, 1);
    }

    // Terrain
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.height);
    L.terrain.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(CONFIG.width, CONFIG.height);
    ctx.closePath();
    ctx.fill();

    // Landing pads (highlighted)
    ctx.fillStyle = '#4f4';
    ctx.shadowColor = '#4f4';
    ctx.shadowBlur = 10;
    L.landingPads.forEach(pad => {
        ctx.fillRect(pad.x, pad.y - 4, pad.width, 4);
    });
    ctx.shadowBlur = 0;

    // Lander ship
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.angle);

    // Ship body
    ctx.strokeStyle = L.status === 'crashed' ? '#f44' : '#4af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-12, -15);
    ctx.moveTo(-8, 8);
    ctx.lineTo(-12, 15);
    ctx.stroke();

    // Thrust flame
    if (L.thrustOn && L.status === 'active') {
        ctx.strokeStyle = '#f80';
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(-20 - Math.random() * 10, 0);
        ctx.lineTo(-5, 5);
        ctx.stroke();
    }

    ctx.restore();

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '16px "Courier New", monospace';

    // Fuel bar
    ctx.fillText('FUEL', 20, 30);
    ctx.strokeStyle = '#4af';
    ctx.strokeRect(70, 15, 100, 20);
    ctx.fillStyle = L.fuel > 20 ? '#4af' : '#f44';
    ctx.fillRect(72, 17, (L.fuel / LANDER_CONFIG.maxFuel) * 96, 16);

    // Velocity
    const speed = Math.sqrt(L.vx * L.vx + L.vy * L.vy);
    ctx.fillStyle = speed < LANDER_CONFIG.maxLandingSpeed ? '#4f4' : '#f44';
    ctx.fillText(`VEL: ${speed.toFixed(1)}`, 200, 30);

    // Altitude
    const alt = Math.max(0, getTerrainHeight(L.x, L.terrain) - L.y - 10);
    ctx.fillStyle = '#fff';
    ctx.fillText(`ALT: ${Math.floor(alt)}`, 320, 30);

    // Angle indicator
    const angleDeg = ((L.angle + Math.PI / 2) * 180 / Math.PI).toFixed(0);
    const angleOk = Math.abs(L.angle + Math.PI / 2) < LANDER_CONFIG.maxLandingAngle;
    ctx.fillStyle = angleOk ? '#4f4' : '#f44';
    ctx.fillText(`ANG: ${angleDeg}°`, 440, 30);

    // Status messages
    if (L.status === 'landed') {
        ctx.fillStyle = '#4f4';
        ctx.font = '32px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LANDED!', CONFIG.width / 2, CONFIG.height / 2 - 40);
        ctx.font = '20px "Courier New", monospace';
        ctx.fillStyle = L.reward.color;
        ctx.fillText(`+ ${L.reward.name}`, CONFIG.width / 2, CONFIG.height / 2);
        ctx.fillStyle = '#888';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press SPACE to continue', CONFIG.width / 2, CONFIG.height / 2 + 40);
        ctx.textAlign = 'left';
    } else if (L.status === 'crashed') {
        ctx.fillStyle = '#f44';
        ctx.font = '32px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED!', CONFIG.width / 2, CONFIG.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press SPACE to continue', CONFIG.width / 2, CONFIG.height / 2 + 20);
        ctx.textAlign = 'left';
    } else {
        // Instructions
        ctx.fillStyle = '#666';
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Land gently on green pads | ← → rotate | ↑ thrust', CONFIG.width / 2, CONFIG.height - 20);
        ctx.textAlign = 'left';
    }
}

// Check if ship is near a mineable rock
export function checkNearbyRocks(ship, rocks, myId, playChimeCallback) {
    if (!ship || ship.state !== PlayerState.FLYING) {
        ship.nearRock = null;
        ship.miningCountdown = 0;
        ship.miningReady = false;
        return;
    }

    const distance = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    // Only large rocks can be mined
    let nearest = null;
    let nearestDist = CONFIG.miningDistance;

    for (const rock of rocks) {
        if (rock.sizeIndex === 0) {  // Only large rocks
            const d = distance(ship, rock);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = rock;
            }
        }
    }

    // Check if we're near the same rock and matching velocity
    if (nearest) {
        const velDiffX = Math.abs(ship.vx - nearest.vx);
        const velDiffY = Math.abs(ship.vy - nearest.vy);
        const velocityMatched = velDiffX < 1.5 && velDiffY < 1.5;

        if (ship.nearRock === nearest && velocityMatched) {
            // Continue countdown
            ship.miningCountdown = (ship.miningCountdown || 0) + 1;
            // 2 seconds at 60fps = 120 frames
            if (ship.miningCountdown >= 120 && !ship.miningReady) {
                ship.miningReady = true;
                // Play chime when ready (only for local player)
                if (ship.id === myId && playChimeCallback) {
                    playChimeCallback();
                }
            }
        } else {
            // Different rock or velocity not matched - reset
            ship.miningCountdown = 0;
            ship.miningReady = false;
        }
    } else {
        // Not near any rock - reset
        ship.miningCountdown = 0;
        ship.miningReady = false;
    }

    ship.nearRock = nearest;
}
