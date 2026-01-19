// ===========================================
// Lunar Defender - Projectiles (Bullets, Missiles, Mines)
// ===========================================

import { CONFIG } from '../config.js';
import { distance, wrapPosition } from '../physics.js';
import { addParticle } from '../particles.js';

// ===========================================
// BULLETS
// ===========================================

export function createBullet(ship) {
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

export function updateBullet(bullet) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.life--;

    // Bullets don't wrap - remove when off-screen
    if (bullet.x < 0 || bullet.x > CONFIG.width ||
        bullet.y < 0 || bullet.y > CONFIG.height) {
        bullet.life = 0;
    }
}

export function drawBullet(ctx, bullet) {
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius || 3, 0, Math.PI * 2);
    ctx.fill();
}

// ===========================================
// HOMING MISSILES
// ===========================================

export function createMissile(ship, rocks) {
    // Find nearest rock to target
    let target = null;
    let nearestDist = 400; // Max lock range
    for (const rock of rocks) {
        const d = distance(ship, rock);
        if (d < nearestDist) {
            nearestDist = d;
            target = rock;
        }
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        x: ship.x + Math.cos(ship.angle) * CONFIG.shipSize,
        y: ship.y + Math.sin(ship.angle) * CONFIG.shipSize,
        vx: Math.cos(ship.angle) * 3 + ship.vx * 0.5,
        vy: Math.sin(ship.angle) * 3 + ship.vy * 0.5,
        angle: ship.angle,
        life: 180,  // 3 seconds
        color: '#4ff',
        ownerId: ship.id,
        targetId: target ? target.id : null,
        thrustTimer: 0
    };
}

export function updateMissile(missile, rocks) {
    missile.life--;
    missile.thrustTimer++;

    // Find target rock
    const target = rocks.find(r => r.id === missile.targetId);

    if (target) {
        // Calculate angle to target
        const targetAngle = Math.atan2(target.y - missile.y, target.x - missile.x);

        // Gradually turn towards target
        let angleDiff = targetAngle - missile.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        missile.angle += angleDiff * 0.08; // Turn rate

        // Thrust towards target
        const thrust = 0.15;
        missile.vx += Math.cos(missile.angle) * thrust;
        missile.vy += Math.sin(missile.angle) * thrust;
    }

    // Cap speed
    const speed = Math.sqrt(missile.vx * missile.vx + missile.vy * missile.vy);
    if (speed > 8) {
        missile.vx = (missile.vx / speed) * 8;
        missile.vy = (missile.vy / speed) * 8;
    }

    // Move
    missile.x += missile.vx;
    missile.y += missile.vy;
    wrapPosition(missile);

    // Spawn thrust particles
    if (missile.thrustTimer % 2 === 0) {
        const backAngle = missile.angle + Math.PI + (Math.random() - 0.5) * 0.3;
        addParticle({
            x: missile.x - Math.cos(missile.angle) * 8,
            y: missile.y - Math.sin(missile.angle) * 8,
            vx: Math.cos(backAngle) * 2,
            vy: Math.sin(backAngle) * 2,
            color: Math.random() > 0.5 ? '#4ff' : '#8ff',
            life: 10 + Math.random() * 10,
            maxLife: 20,
            size: 1 + Math.random(),
            glow: true
        });
    }
}

export function drawMissile(ctx, missile) {
    ctx.save();
    ctx.translate(missile.x, missile.y);
    ctx.rotate(missile.angle);

    // Glow
    ctx.shadowColor = '#4ff';
    ctx.shadowBlur = 10;

    // Missile body
    ctx.fillStyle = '#4ff';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-5, -4);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-5, 4);
    ctx.closePath();
    ctx.fill();

    // Thrust flame
    ctx.shadowBlur = 5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-3, -2);
    ctx.lineTo(-8 - Math.random() * 4, 0);
    ctx.lineTo(-3, 2);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
}

// ===========================================
// PROXIMITY MINES
// ===========================================

export function createMine(ship) {
    return {
        id: Math.random().toString(36).substr(2, 9),
        x: ship.x - Math.cos(ship.angle) * CONFIG.shipSize,
        y: ship.y - Math.sin(ship.angle) * CONFIG.shipSize,
        vx: -Math.cos(ship.angle) * 1 + ship.vx * 0.3,
        vy: -Math.sin(ship.angle) * 1 + ship.vy * 0.3,
        life: 600,  // 10 seconds
        armed: false,
        armTimer: 60,  // 1 second to arm
        triggerRadius: 50,
        ownerId: ship.id,
        pulseTimer: 0
    };
}

export function updateMine(mine) {
    mine.life--;
    mine.pulseTimer++;

    // Arm after delay
    if (!mine.armed) {
        mine.armTimer--;
        if (mine.armTimer <= 0) {
            mine.armed = true;
        }
    }

    // Slow down
    mine.vx *= 0.98;
    mine.vy *= 0.98;

    // Move
    mine.x += mine.vx;
    mine.y += mine.vy;
    wrapPosition(mine);
}

export function drawMine(ctx, mine) {
    ctx.save();
    ctx.translate(mine.x, mine.y);

    // Pulse effect
    const pulse = Math.sin(mine.pulseTimer * 0.1) * 0.3 + 0.7;

    // Glow
    ctx.shadowColor = mine.armed ? '#f4f' : '#888';
    ctx.shadowBlur = 10 * pulse;

    // Outer ring
    ctx.strokeStyle = mine.armed ? `rgba(255, 68, 255, ${pulse})` : '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Inner core
    ctx.fillStyle = mine.armed ? '#f4f' : '#444';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Spikes
    ctx.strokeStyle = mine.armed ? '#f4f' : '#666';
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + mine.pulseTimer * 0.02;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        ctx.lineTo(Math.cos(angle) * 12, Math.sin(angle) * 12);
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.restore();
}
