// ===========================================
// Lunar Defender - Physics & Collision Detection
// ===========================================

import { CONFIG } from './config.js';
import { wrappedDistance, wrappedDirection } from './camera.js';

export function wrapPosition(obj) {
    if (obj.x < 0) obj.x += CONFIG.worldWidth;
    if (obj.x >= CONFIG.worldWidth) obj.x -= CONFIG.worldWidth;
    if (obj.y < 0) obj.y += CONFIG.worldHeight;
    if (obj.y >= CONFIG.worldHeight) obj.y -= CONFIG.worldHeight;
}

export function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Check and resolve rock-to-rock collisions
export function checkRockCollisions(rocks, onCollision) {
    const energyLoss = 0.95; // 5% energy lost to "heat"

    for (let i = 0; i < rocks.length; i++) {
        for (let j = i + 1; j < rocks.length; j++) {
            const r1 = rocks[i];
            const r2 = rocks[j];

            const dist = wrappedDistance(r1, r2);
            const minDist = r1.radius + r2.radius;

            if (dist < minDist && dist > 0) {
                // Collision detected!
                // Calculate collision normal using wrapped direction
                const dir = wrappedDirection(r1, r2);
                const nx = dir.x;
                const ny = dir.y;

                // Relative velocity
                const dvx = r1.vx - r2.vx;
                const dvy = r1.vy - r2.vy;

                // Relative velocity along collision normal
                const dvn = dvx * nx + dvy * ny;

                // Only resolve if rocks are approaching
                if (dvn > 0) {
                    // Mass proportional to radius squared (area)
                    const m1 = r1.radius * r1.radius;
                    const m2 = r2.radius * r2.radius;
                    const totalMass = m1 + m2;

                    // Impulse scalar (momentum conservation)
                    const impulse = (2 * dvn) / totalMass;

                    // Apply impulse with energy loss
                    r1.vx -= (impulse * m2 * nx) * energyLoss;
                    r1.vy -= (impulse * m2 * ny) * energyLoss;
                    r2.vx += (impulse * m1 * nx) * energyLoss;
                    r2.vy += (impulse * m1 * ny) * energyLoss;

                    // Separate rocks to prevent overlap
                    const overlap = minDist - dist;
                    const separationRatio1 = m2 / totalMass;
                    const separationRatio2 = m1 / totalMass;
                    r1.x -= overlap * nx * separationRatio1;
                    r1.y -= overlap * ny * separationRatio1;
                    r2.x += overlap * nx * separationRatio2;
                    r2.y += overlap * ny * separationRatio2;

                    // Calculate impact point and speed for callback
                    const impactX = r1.x + nx * r1.radius;
                    const impactY = r1.y + ny * r1.radius;
                    const impactSpeed = Math.abs(dvn);

                    // Flash glow on rocks
                    r1.glowColor = '#864';
                    r2.glowColor = '#864';
                    setTimeout(() => {
                        if (r1) r1.glowColor = null;
                        if (r2) r2.glowColor = null;
                    }, 100);

                    // Callback for particles and sound
                    if (onCollision) {
                        onCollision(impactX, impactY, impactSpeed, nx, ny);
                    }
                }
            }
        }
    }
}
