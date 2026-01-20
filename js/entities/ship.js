// ===========================================
// Lunar Defender - Ship Entity
// ===========================================

import { CONFIG, PlayerState } from '../config.js';

const SHIP_COLORS = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];

// Inline session stats creation to avoid circular dependency
function createSessionStats() {
    return {
        rocksDestroyed: 0,
        shotsFired: 0,
        fuelUsed: 0,
        sessionStart: Date.now(),
        deaths: 0
    };
}

export function randomColor() {
    return SHIP_COLORS[Math.floor(Math.random() * SHIP_COLORS.length)];
}

export function createShip(id, x, y, color, name) {
    return {
        id: id,
        x: x || CONFIG.worldWidth / 2,
        y: y || CONFIG.worldHeight / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        color: color || randomColor(),
        thrusting: false,
        name: name || 'Unknown',
        stats: createSessionStats(),
        state: PlayerState.FLYING,
        upgrades: [],           // Array of upgrade objects with ammo
        nearRock: null,         // Rock we're close to (can mine)
        miningRockId: null      // Rock we're currently mining
    };
}

export function updateShip(ship, input) {
    // Rotation
    if (input.left) ship.angle -= CONFIG.shipRotSpeed;
    if (input.right) ship.angle += CONFIG.shipRotSpeed;

    // Thrust
    ship.thrusting = input.up;
    if (input.up) {
        ship.vx += Math.cos(ship.angle) * CONFIG.shipThrust;
        ship.vy += Math.sin(ship.angle) * CONFIG.shipThrust;
    }

    // Cap max speed
    const speed = Math.sqrt(ship.vx * ship.vx + ship.vy * ship.vy);
    if (speed > CONFIG.shipMaxSpeed) {
        ship.vx = (ship.vx / speed) * CONFIG.shipMaxSpeed;
        ship.vy = (ship.vy / speed) * CONFIG.shipMaxSpeed;
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

export function drawShip(ctx, ship) {
    ctx.save();
    ctx.translate(ship.x, ship.y);

    // Draw name above ship
    ctx.fillStyle = ship.color;
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ship.name, 0, -CONFIG.shipSize - 10);

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

// Draw a tiny ship on a rock (for mining players)
export function drawMiningShipOnRock(ctx, ship, rock) {
    if (!rock) return;

    const scale = 0.4; // Tiny ship
    const orbitRadius = rock.radius + 8;

    // Position ship on the rock's surface (use ship angle for position)
    const posAngle = ship.angle + Math.PI; // Opposite of ship facing
    const x = rock.x + Math.cos(posAngle) * orbitRadius;
    const y = rock.y + Math.sin(posAngle) * orbitRadius;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.angle);
    ctx.scale(scale, scale);

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

    ctx.restore();

    // Draw name near the rock
    ctx.fillStyle = ship.color;
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(ship.name + ' ⛏', rock.x, rock.y - rock.radius - 15);
}

function wrapPosition(obj) {
    // Wrap in world coordinates
    if (obj.x < 0) obj.x += CONFIG.worldWidth;
    if (obj.x >= CONFIG.worldWidth) obj.x -= CONFIG.worldWidth;
    if (obj.y < 0) obj.y += CONFIG.worldHeight;
    if (obj.y >= CONFIG.worldHeight) obj.y -= CONFIG.worldHeight;
}
