// ===========================================
// Lunar Defender - Game Loop
// ===========================================

import { CONFIG, PlayerState } from './config.js';
import { playShoot, playClick, playExplosion, playChime, startThrust, stopThrust, playRockCollision } from './audio.js';
import { updateParticles, renderParticles, spawnThrustParticle, addParticle, spawnRockCollisionParticles } from './particles.js';
import { initStarfield, updateStarfield, renderStarfield } from './starfield.js';
import { createShip, updateShip, drawShip, drawMiningShipOnRock } from './entities/ship.js';
import { createRock, updateRock, drawRock, spawnInitialRocks } from './entities/rock.js';
import { createBullet, updateBullet, drawBullet, createMissile, updateMissile, drawMissile, createMine, updateMine, drawMine } from './entities/projectiles.js';
import { distance, checkRockCollisions } from './physics.js';
import { UPGRADES, hasUpgrade, useUpgradeAmmo, getRandomUpgrade } from './upgrades.js';
import { createLanderState, updateLander, renderLander, getLanderState, setLanderState, checkNearbyRocks } from './mining.js';
import { GameEvents, createEvent, logEvent, createSessionStats, saveLifetimeStats, loadLifetimeStats } from './stats.js';
import { getBotInput } from './bot.js';
import { broadcastState, broadcastEvent, broadcastGameStart, sendInputToHost, updatePlayerCount, setGameRefs } from './network.js';
import { updateHUD, resizeCanvas, showGameUI } from './ui.js';
import { getKeys, setExitMiningCallback } from './input.js';

// Game state
let canvas, ctx;
let gameRunning = false;
let isHost = false;
let isBot = false;
let myId = null;
let myUserId = null;
let myName = null;
let currentRoomCode = null;
let myLifetimeStats = null;

// Game objects
let ships = {};
let rocks = [];
let bullets = [];
let missiles = [];
let mines = [];

// Timing
let lastShot = 0;
let lastAltFire = 0;
let thrustStartTime = {};

// ===========================================
// GETTERS/SETTERS
// ===========================================

export function getGameState() {
    return { ships, rocks, bullets, missiles, mines, gameRunning, isHost, isBot, myId, myUserId, myName, currentRoomCode };
}

export function setGameState(state) {
    if (state.ships !== undefined) {
        // Preserve local mining state for my ship when receiving updates
        if (myId && ships[myId]) {
            const myOldShip = ships[myId];
            const localMiningState = {
                nearRock: myOldShip.nearRock,
                nearRockId: myOldShip.nearRockId,
                miningCountdown: myOldShip.miningCountdown,
                miningReady: myOldShip.miningReady
            };
            ships = state.ships;
            // Restore local mining state
            if (ships[myId]) {
                ships[myId].nearRock = localMiningState.nearRock;
                ships[myId].nearRockId = localMiningState.nearRockId;
                ships[myId].miningCountdown = localMiningState.miningCountdown;
                ships[myId].miningReady = localMiningState.miningReady;
            }
        } else {
            ships = state.ships;
        }
    }
    if (state.rocks !== undefined) rocks = state.rocks;
    if (state.bullets !== undefined) bullets = state.bullets;
    if (state.missiles !== undefined) missiles = state.missiles;
    if (state.mines !== undefined) mines = state.mines;
    if (state.gameRunning !== undefined) gameRunning = state.gameRunning;
    if (state.isHost !== undefined) isHost = state.isHost;
    if (state.isBot !== undefined) isBot = state.isBot;
    if (state.myId !== undefined) myId = state.myId;
    if (state.myUserId !== undefined) myUserId = state.myUserId;
    if (state.myName !== undefined) myName = state.myName;
    if (state.currentRoomCode !== undefined) currentRoomCode = state.currentRoomCode;
}

export function getShips() { return ships; }
export function getRocks() { return rocks; }
export function getBullets() { return bullets; }
export function getMyId() { return myId; }
export function getCurrentRoomCode() { return currentRoomCode; }
export function getIsHost() { return isHost; }

export function setCanvas(c) {
    canvas = c;
    ctx = canvas.getContext('2d');
}

export function setLifetimeStats(stats) {
    myLifetimeStats = stats;
}

// ===========================================
// MINING MODE
// ===========================================

function enterMiningMode(rockId) {
    const myShip = ships[myId];
    if (!myShip || myShip.state === PlayerState.MINING) return;

    myShip.state = PlayerState.MINING;
    myShip.miningRockId = rockId;

    // Create lunar lander state
    setLanderState(createLanderState(rockId));

    // Broadcast state change
    if (isHost) {
        broadcastEvent(createEvent(GameEvents.PLAYER_MINING, { playerId: myId, rockId }));
    }

    console.log('Entered mining mode for rock:', rockId);
}

function exitMiningMode(success, upgrade) {
    const myShip = ships[myId];
    if (!myShip) return;

    // Find the rock and reposition ship to its current location
    const rock = rocks.find(r => r.id === myShip.miningRockId);
    if (rock) {
        // Position ship just outside the rock, matching its velocity
        const exitAngle = myShip.angle;
        myShip.x = rock.x + Math.cos(exitAngle) * (rock.radius + 20);
        myShip.y = rock.y + Math.sin(exitAngle) * (rock.radius + 20);
        myShip.vx = rock.vx;
        myShip.vy = rock.vy;
    }

    myShip.state = PlayerState.FLYING;

    if (success && upgrade) {
        // Add upgrade if we don't already have it
        if (!myShip.upgrades.some(u => u.id === upgrade.id)) {
            myShip.upgrades.push({
                id: upgrade.id,
                ammo: upgrade.ammo,
                type: upgrade.type
            });
            console.log('Got upgrade:', upgrade.name);
        }
    }

    myShip.miningRockId = null;
    setLanderState(null);

    // Broadcast state change
    if (isHost) {
        broadcastEvent(createEvent(GameEvents.PLAYER_LEFT, {
            playerId: myId,
            upgrade: success ? upgrade?.id : null
        }));
    }
}

// Set the callback for input.js
setExitMiningCallback(exitMiningMode);

// ===========================================
// SHOOTING
// ===========================================

function fireBullets(ship) {
    if (ship.id === myId) {
        playShoot();
    }

    let usedSpread = false;
    let usedBig = false;
    let usedExplosive = false;

    if (hasUpgrade(ship, 'spread_shot')) {
        // Fire 3 bullets in a cone
        for (let i = -1; i <= 1; i++) {
            const spreadAngle = ship.angle + i * 0.2;
            const bullet = createBullet(ship);
            bullet.vx = Math.cos(spreadAngle) * CONFIG.bulletSpeed + ship.vx;
            bullet.vy = Math.sin(spreadAngle) * CONFIG.bulletSpeed + ship.vy;
            if (hasUpgrade(ship, 'big_bullets')) {
                bullet.radius = 5;
                usedBig = true;
            }
            if (hasUpgrade(ship, 'explosives')) {
                bullet.explosive = true;
                usedExplosive = true;
            }
            bullets.push(bullet);
        }
        usedSpread = true;
    } else {
        const bullet = createBullet(ship);
        if (hasUpgrade(ship, 'big_bullets')) {
            bullet.radius = 5;
            usedBig = true;
        }
        if (hasUpgrade(ship, 'explosives')) {
            bullet.explosive = true;
            usedExplosive = true;
        }
        bullets.push(bullet);
    }

    // Use ammo for upgrades
    if (usedSpread) useUpgradeAmmo(ship, 'spread_shot');
    if (usedBig) useUpgradeAmmo(ship, 'big_bullets');
    if (usedExplosive) useUpgradeAmmo(ship, 'explosives');
    if (hasUpgrade(ship, 'rapid_fire')) useUpgradeAmmo(ship, 'rapid_fire');

    broadcastEvent(createEvent(GameEvents.SHOT_FIRED, { playerId: ship.id }));
}

function fireSecondary(ship) {
    if (!ship) return;

    // Check for homing missiles
    if (hasUpgrade(ship, 'homing_missiles')) {
        missiles.push(createMissile(ship, rocks));
        useUpgradeAmmo(ship, 'homing_missiles');
        if (ship.id === myId) playShoot();
        return;
    }

    // Check for proximity mines
    if (hasUpgrade(ship, 'proximity_mines')) {
        mines.push(createMine(ship));
        useUpgradeAmmo(ship, 'proximity_mines');
        if (ship.id === myId) playClick();
        return;
    }
}

// ===========================================
// COLLISIONS
// ===========================================

// Check if a rock is currently being mined by any player
function isRockBeingMined(rockId) {
    return Object.values(ships).some(
        ship => ship.state === PlayerState.MINING && ship.miningRockId === rockId
    );
}

function checkBulletRockCollisions() {
    if (!isHost) return;

    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const bulletRadius = bullet.radius || 3;

        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            // Skip rocks being mined
            if (isRockBeingMined(rock.id)) continue;

            if (distance(bullet, rock) < rock.radius + bulletRadius) {
                broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                    playerId: bullet.ownerId,
                    rockId: rock.id,
                    rockSize: rock.sizeIndex
                }));

                const shooter = ships[bullet.ownerId];
                const isExplosive = shooter?.upgrades?.some(u => u.id === 'explosives');

                bullets.splice(i, 1);

                if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                    if (!isExplosive) {
                        for (let k = 0; k < 2; k++) {
                            rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                        }
                    }
                }

                const rockX = rock.x;
                const rockY = rock.y;
                const rockSize = rock.sizeIndex;
                rocks.splice(j, 1);

                playExplosion(rockSize);

                // Spawn explosion particles
                const particleCount = (3 - rockSize) * 12 + 8;
                for (let p = 0; p < particleCount; p++) {
                    const angle = (p / particleCount) * Math.PI * 2 + Math.random() * 0.5;
                    const speed = (2 + (2 - rockSize)) * (0.3 + Math.random() * 0.7);
                    const isGlowing = Math.random() > 0.7;

                    addParticle({
                        x: rockX + (Math.random() - 0.5) * 15,
                        y: rockY + (Math.random() - 0.5) * 15,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: isGlowing ? '#fa8' : (Math.random() > 0.5 ? '#888' : '#666'),
                        life: 25 + Math.random() * 35,
                        maxLife: 60,
                        size: 1 + Math.random() * (3 - rockSize),
                        glow: isGlowing
                    });
                }

                // Central flash
                addParticle({
                    x: rockX,
                    y: rockY,
                    vx: 0,
                    vy: 0,
                    color: '#fff',
                    life: 8,
                    maxLife: 8,
                    size: 10 + (2 - rockSize) * 5,
                    glow: true
                });

                // Explosive chain reaction (skip mined rocks)
                if (isExplosive) {
                    for (let k = rocks.length - 1; k >= 0; k--) {
                        if (isRockBeingMined(rocks[k].id)) continue;
                        if (distance({ x: rockX, y: rockY }, rocks[k]) < 80) {
                            broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                                playerId: bullet.ownerId,
                                rockId: rocks[k].id,
                                rockSize: rocks[k].sizeIndex
                            }));
                            rocks.splice(k, 1);
                        }
                    }
                }

                // Respawn rocks if all destroyed
                if (rocks.length === 0) {
                    setTimeout(() => {
                        if (isHost && gameRunning) {
                            rocks = spawnInitialRocks(CONFIG.initialRocks);
                            broadcastState(ships, rocks, bullets);
                        }
                    }, 2000);
                }

                break;
            }
        }
    }
}

function checkMineCollisions() {
    if (!isHost) return;

    for (let i = mines.length - 1; i >= 0; i--) {
        const mine = mines[i];
        if (!mine.armed) continue;

        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            // Skip rocks being mined
            if (isRockBeingMined(rock.id)) continue;

            const dist = distance(mine, rock);

            if (dist < mine.triggerRadius + rock.radius) {
                explodeMine(mine, i);
                break;
            }
        }
    }
}

function explodeMine(mine, index) {
    const x = mine.x;
    const y = mine.y;

    mines.splice(index, 1);
    playExplosion(0);

    // Damage nearby rocks (skip mined rocks)
    for (let i = rocks.length - 1; i >= 0; i--) {
        const rock = rocks[i];
        // Skip rocks being mined
        if (isRockBeingMined(rock.id)) continue;

        if (distance({ x, y }, rock) < 80) {
            broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                playerId: mine.ownerId,
                rockId: rock.id,
                rockSize: rock.sizeIndex
            }));

            const particleCount = (3 - rock.sizeIndex) * 8 + 5;
            for (let p = 0; p < particleCount; p++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                addParticle({
                    x: rock.x,
                    y: rock.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: Math.random() > 0.5 ? '#f4f' : '#888',
                    life: 25 + Math.random() * 25,
                    maxLife: 50,
                    size: 1 + Math.random() * 2,
                    glow: Math.random() > 0.6
                });
            }

            if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                for (let k = 0; k < 2; k++) {
                    rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                }
            }

            rocks.splice(i, 1);
        }
    }

    // Big explosion particles
    for (let p = 0; p < 30; p++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        addParticle({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: Math.random() > 0.7 ? '#fff' : (Math.random() > 0.5 ? '#f4f' : '#a4a'),
            life: 20 + Math.random() * 30,
            maxLife: 50,
            size: 2 + Math.random() * 3,
            glow: true
        });
    }
}

function checkMissileRockCollisions() {
    if (!isHost) return;

    for (let i = missiles.length - 1; i >= 0; i--) {
        const missile = missiles[i];

        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            // Skip rocks being mined
            if (isRockBeingMined(rock.id)) continue;

            if (distance(missile, rock) < rock.radius + 10) {
                broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                    playerId: missile.ownerId,
                    rockId: rock.id,
                    rockSize: rock.sizeIndex
                }));

                missiles.splice(i, 1);

                if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                    for (let k = 0; k < 2; k++) {
                        rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                    }
                }

                playExplosion(rock.sizeIndex);
                rocks.splice(j, 1);

                if (rocks.length === 0) {
                    setTimeout(() => {
                        if (isHost && gameRunning) {
                            rocks = spawnInitialRocks(CONFIG.initialRocks);
                            broadcastState(ships, rocks, bullets);
                        }
                    }, 2000);
                }

                break;
            }
        }
    }
}

// ===========================================
// UPDATE
// ===========================================

export function update() {
    const myShip = ships[myId];
    const keys = getKeys();

    // Check if we're in mining mode (lunar lander)
    const inMiningMode = myShip && myShip.state === PlayerState.MINING;
    if (inMiningMode) {
        updateLander(keys);
        // Don't return early if host - need to keep updating game for other players
        if (!isHost) {
            return;
        }
    }

    if (isHost) {
        // Host updates all game state
        if (myShip && myShip.state === PlayerState.FLYING) {
            const input = isBot ? getBotInput(myShip, rocks) : keys;

            // Check for mining trigger
            checkNearbyRocks(myShip, rocks, myId, playChime);
            if (keys.mine && myShip.nearRock && myShip.miningReady) {
                enterMiningMode(myShip.nearRock.id);
                return;
            }

            // Shooting with upgrades
            const fireRate = hasUpgrade(myShip, 'rapid_fire') ? 100 : 200;
            if (input.space && Date.now() - lastShot > fireRate) {
                fireBullets(myShip);
                lastShot = Date.now();
            }

            // Alt-fire for secondary weapons
            if (keys.altFire && Date.now() - lastAltFire > 300) {
                fireSecondary(myShip);
                lastAltFire = Date.now();
            }

            // Track host's thrust
            if (input.up && !thrustStartTime[myId]) {
                thrustStartTime[myId] = Date.now();
                startThrust();
            } else if (!input.up && thrustStartTime[myId]) {
                stopThrust();
                const duration = (Date.now() - thrustStartTime[myId]) / 1000;
                if (myShip.stats) {
                    myShip.stats.fuelUsed += duration * CONFIG.fuelPerThrust * 60;
                }
                delete thrustStartTime[myId];
            }

            // Spawn thrust particles
            if (input.up) {
                spawnThrustParticle(myShip);
            }

            updateShip(myShip, input);
        }

        // Update client ships based on their inputs
        Object.values(ships).forEach(ship => {
            if (ship.id !== myId && ship.input && ship.state === PlayerState.FLYING) {
                updateShip(ship, ship.input);

                // Handle client alt-fire
                if (ship.input.altFire) {
                    fireSecondary(ship);
                    ship.input.altFire = false; // Prevent repeated firing
                }
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

        // Update missiles
        for (let i = missiles.length - 1; i >= 0; i--) {
            updateMissile(missiles[i], rocks);
            if (missiles[i].life <= 0) {
                missiles.splice(i, 1);
            }
        }

        // Update mines
        for (let i = mines.length - 1; i >= 0; i--) {
            updateMine(mines[i]);
            if (mines[i].life <= 0) {
                mines.splice(i, 1);
            }
        }

        // Check collisions
        checkBulletRockCollisions();
        checkMissileRockCollisions();
        checkMineCollisions();
        checkRockCollisions(rocks, (x, y, speed, nx, ny) => {
            spawnRockCollisionParticles(x, y, speed, nx, ny);
            if (speed > 0.5) {
                playRockCollision(speed);
            }
        });

        // Update particles
        updateParticles();

        // Update starfield
        updateStarfield();
    } else {
        // Client: check for mining
        if (myShip && myShip.state === PlayerState.FLYING) {
            checkNearbyRocks(myShip, rocks, myId, playChime);
            if (keys.mine && myShip.nearRock && myShip.miningReady) {
                enterMiningMode(myShip.nearRock.id);
                return;
            }
        }

        // Client sends input to host
        const result = sendInputToHost(keys, lastShot, lastAltFire);
        lastShot = result.lastShot;
        lastAltFire = result.lastAltFire;

        // Client-side thrust particles
        if (keys.up && myShip) {
            spawnThrustParticle(myShip);
        }

        // Update particles on client too
        updateParticles();

        // Update starfield on client too
        updateStarfield();
    }

    updateHUD(ships, rocks, myId);
}

// ===========================================
// RENDER
// ===========================================

export function render() {
    const myShip = ships[myId];

    // If in mining mode, render lunar lander instead
    if (myShip && myShip.state === PlayerState.MINING) {
        renderLander(ctx);
        return;
    }

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Draw starfield and nebulas
    renderStarfield(ctx);

    // Check which rocks are being mined
    const minedRockIds = new Set(
        Object.values(ships)
            .filter(s => s.state === PlayerState.MINING && s.miningRockId)
            .map(s => s.miningRockId)
    );

    // Draw rocks (highlight mineable ones and mined ones)
    rocks.forEach(rock => {
        drawRock(ctx, rock);

        // Highlight rocks being mined with a pulsing glow
        if (minedRockIds.has(rock.id)) {
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
            ctx.strokeStyle = `rgba(255, 200, 100, ${0.5 + pulse * 0.5})`;
            ctx.lineWidth = 3;
            ctx.shadowColor = '#fa0';
            ctx.shadowBlur = 10 + pulse * 10;
            ctx.beginPath();
            ctx.arc(rock.x, rock.y, rock.radius + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Highlight if we're near and can mine
        if (myShip && myShip.nearRock === rock) {
            const progress = (myShip.miningCountdown || 0) / 120;
            const ready = myShip.miningReady;

            // Background circle (dashed, dim)
            ctx.strokeStyle = ready ? '#4f4' : '#444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(rock.x, rock.y, rock.radius + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Progress arc (solid, bright)
            if (progress > 0) {
                ctx.strokeStyle = ready ? '#4f4' : '#fa0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(rock.x, rock.y, rock.radius + 10, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
                ctx.stroke();
            }

            // Glow effect when ready
            if (ready) {
                ctx.strokeStyle = '#4f4';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#4f4';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(rock.x, rock.y, rock.radius + 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    });

    // Draw bullets
    bullets.forEach(b => drawBullet(ctx, b));

    // Draw missiles
    missiles.forEach(m => drawMissile(ctx, m));

    // Draw mines
    mines.forEach(m => drawMine(ctx, m));

    // Draw particles
    renderParticles(ctx);

    // Draw ships
    Object.values(ships).forEach(ship => {
        if (ship.state === PlayerState.MINING) {
            // Draw tiny ship on the rock they're mining
            const miningRock = rocks.find(r => r.id === ship.miningRockId);
            if (miningRock) {
                drawMiningShipOnRock(ctx, ship, miningRock);
            }
        } else {
            drawShip(ctx, ship);
        }
    });

    // Show mining prompt if near a rock
    if (myShip && myShip.nearRock) {
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';

        if (myShip.miningReady) {
            ctx.fillStyle = '#4f4';
            ctx.fillText('Press E to mine', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
        } else {
            const progress = (myShip.miningCountdown || 0) / 120;
            if (progress > 0) {
                ctx.fillStyle = '#fa0';
                ctx.fillText('Matching velocity...', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
            } else {
                ctx.fillStyle = '#888';
                ctx.fillText('Match speed to dock', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
            }
        }
        ctx.textAlign = 'left';
    }

    // Show upgrades
    if (myShip && myShip.upgrades && myShip.upgrades.length > 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('Upgrades:', CONFIG.width - 120, 20);
        myShip.upgrades.forEach((upObj, i) => {
            const upgrade = Object.values(UPGRADES).find(u => u.id === upObj.id);
            if (upgrade) {
                ctx.fillStyle = upgrade.color;
                ctx.fillText(`${upgrade.name} (${upObj.ammo})`, CONFIG.width - 120, 35 + i * 15);
            }
        });
    }

    // Show host info in bottom left
    if (currentRoomCode) {
        ctx.fillStyle = '#666';
        ctx.font = '12px "Courier New", monospace';
        const hostName = isHost ? myName : (Object.values(ships).find(s => s.id === currentRoomCode)?.name || 'Host');
        ctx.fillText(`Host: ${hostName}`, 10, CONFIG.height - 30);
        ctx.fillText(`Room: ${currentRoomCode}`, 10, CONFIG.height - 15);
    }
}

// ===========================================
// GAME LOOP
// ===========================================

function gameLoop() {
    if (!gameRunning) return;

    update();
    render();

    requestAnimationFrame(gameLoop);
}

// ===========================================
// START GAME
// ===========================================

export function startGame() {
    gameRunning = true;

    // Initialize starfield
    initStarfield();

    // Increment games played
    if (myLifetimeStats) {
        myLifetimeStats.gamesPlayed++;
        saveLifetimeStats(myLifetimeStats);
    }

    // Show game UI
    showGameUI(isHost, currentRoomCode);

    // Size canvas
    resizeCanvas(canvas);

    if (isHost) {
        // Create host ship if not exists
        if (!ships[myId]) {
            ships[myId] = createShip(myId, null, null, '#4af', myName);
        }

        // Spawn rocks
        rocks = spawnInitialRocks(CONFIG.initialRocks);

        // Set refs for network module
        setGameRefs(ships, bullets, rocks, thrustStartTime);

        // Notify clients
        broadcastGameStart(ships, rocks, bullets);

        // Start network broadcast loop
        setInterval(() => {
            if (gameRunning) {
                broadcastState(ships, rocks, bullets);
            }
        }, CONFIG.networkTickRate);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
}

// ===========================================
// STATS SAVING
// ===========================================

export function saveCurrentStats() {
    if (!gameRunning || !myId || !ships[myId]) return;

    const myShip = ships[myId];
    if (myShip && myShip.stats) {
        // Create a copy of current session for merging
        const sessionCopy = { ...myShip.stats };

        // Merge into lifetime (but don't double-count)
        if (!myShip.stats._lastSaved) {
            myShip.stats._lastSaved = createSessionStats();
        }

        // Calculate delta since last save
        const delta = {
            rocksDestroyed: sessionCopy.rocksDestroyed - myShip.stats._lastSaved.rocksDestroyed,
            shotsFired: sessionCopy.shotsFired - myShip.stats._lastSaved.shotsFired,
            fuelUsed: sessionCopy.fuelUsed - myShip.stats._lastSaved.fuelUsed,
            deaths: sessionCopy.deaths - myShip.stats._lastSaved.deaths,
            sessionStart: sessionCopy.sessionStart
        };

        // Only save if there's new data
        if (delta.rocksDestroyed > 0 || delta.shotsFired > 0 || delta.fuelUsed > 0) {
            myLifetimeStats.rocksDestroyed += delta.rocksDestroyed;
            myLifetimeStats.shotsFired += delta.shotsFired;
            myLifetimeStats.fuelUsed += delta.fuelUsed;
            myLifetimeStats.deaths += delta.deaths;
            myLifetimeStats.lastPlayed = new Date().toISOString();

            saveLifetimeStats(myLifetimeStats);
            console.log('Stats saved:', delta);

            // Update last saved reference
            myShip.stats._lastSaved = { ...sessionCopy };
        }
    }
}

// Handle game events
export function handleGameEvent(event) {
    logEvent(event);

    switch (event.type) {
        case GameEvents.ROCK_DESTROYED:
            if (ships[event.playerId]?.stats) {
                ships[event.playerId].stats.rocksDestroyed++;
            }
            break;
        case GameEvents.SHOT_FIRED:
            if (ships[event.playerId]?.stats) {
                ships[event.playerId].stats.shotsFired++;
            }
            break;
    }
}
