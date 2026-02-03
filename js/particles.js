// ===========================================
// Lunar Defender - Particle System
// ===========================================

import { CONFIG } from './config.js';
import { getVisiblePositions, wrapWorldPosition } from './camera.js';

let particles = [];

export function getParticles() {
    return particles;
}

export function clearParticles() {
    particles = [];
}

export function createParticle(x, y, vx, vy, color, life, size) {
    return {
        x, y, vx, vy,
        color: color || '#fff',
        life: life || 60,
        maxLife: life || 60,
        size: size || 2
    };
}

export function addParticle(particle) {
    particles.push(particle);
}

export function spawnExplosionParticles(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const vel = (speed || 3) * (0.5 + Math.random() * 0.5);
        particles.push(createParticle(
            x + (Math.random() - 0.5) * 10,
            y + (Math.random() - 0.5) * 10,
            Math.cos(angle) * vel,
            Math.sin(angle) * vel,
            color || '#fff',
            30 + Math.random() * 30,
            1 + Math.random() * 2
        ));
    }
}

export function spawnThrustParticle(ship) {
    if (!ship || Math.random() > 0.5) return;

    const backX = ship.x - Math.cos(ship.angle) * CONFIG.shipSize * 0.5;
    const backY = ship.y - Math.sin(ship.angle) * CONFIG.shipSize * 0.5;

    // Add some spread
    const spread = (Math.random() - 0.5) * 0.6;
    const angle = ship.angle + Math.PI + spread;
    const vel = 2 + Math.random() * 2.5;

    const isHot = Math.random() > 0.6;

    particles.push({
        x: backX + (Math.random() - 0.5) * 8,
        y: backY + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * vel + ship.vx * 0.5,
        vy: Math.sin(angle) * vel + ship.vy * 0.5,
        color: isHot ? '#ff8' : (Math.random() > 0.5 ? '#f80' : '#f60'),
        life: 12 + Math.random() * 18,
        maxLife: 30,
        size: 1.5 + Math.random() * 2,
        glow: isHot
    });

    // Occasional bright spark
    if (Math.random() > 0.85) {
        particles.push({
            x: backX,
            y: backY,
            vx: Math.cos(angle) * vel * 1.5 + ship.vx * 0.3,
            vy: Math.sin(angle) * vel * 1.5 + ship.vy * 0.3,
            color: '#fff',
            life: 8,
            maxLife: 8,
            size: 2,
            glow: true
        });
    }
}

// Rock collision particles - sparks and debris
export function spawnRockCollisionParticles(x, y, speed, nx, ny) {
    const count = Math.min(15, Math.floor(speed * 5) + 3);

    for (let i = 0; i < count; i++) {
        // Sparks perpendicular to collision
        const perpAngle = Math.atan2(ny, nx) + (Math.random() - 0.5) * Math.PI;
        const vel = (0.5 + Math.random()) * speed * 0.8;

        particles.push({
            x: x + (Math.random() - 0.5) * 8,
            y: y + (Math.random() - 0.5) * 8,
            vx: Math.cos(perpAngle) * vel,
            vy: Math.sin(perpAngle) * vel,
            color: Math.random() > 0.6 ? '#fa8' : (Math.random() > 0.5 ? '#864' : '#654'),
            life: 15 + Math.random() * 20,
            maxLife: 35,
            size: 1 + Math.random() * 2,
            glow: Math.random() > 0.5
        });
    }

    // Heat glow particle at impact point
    particles.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        color: '#f84',
        life: 10,
        maxLife: 10,
        size: 5 + speed * 2,
        glow: true
    });
}

export function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life--;

        // Wrap particles in world coordinates
        wrapWorldPosition(p);

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

export function renderParticles(ctx) {
    for (const p of particles) {
        const alpha = p.life / p.maxLife;
        const size = p.size * (0.3 + alpha * 0.7);

        // Get visible screen positions (handles wrapping at world edges)
        const positions = getVisiblePositions(p.x, p.y, size);

        for (const pos of positions) {
            ctx.globalAlpha = alpha;

            // Glow effect for bright particles
            if (p.glow) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = p.size * 3;
            }

            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
            ctx.fill();

            ctx.shadowBlur = 0;
        }
    }
    ctx.globalAlpha = 1;
}
