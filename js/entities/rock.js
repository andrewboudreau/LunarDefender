// ===========================================
// Lunar Defender - Rock Entity
// ===========================================

import { CONFIG } from '../config.js';
import { distance, wrapPosition } from '../physics.js';

export function createRock(x, y, size) {
    const sizeIndex = size !== undefined ? size : 0;
    const radius = CONFIG.rockSizes[sizeIndex];
    const angle = Math.random() * Math.PI * 2;
    const speed = CONFIG.rockSpeed * (1 + Math.random());

    // Create jagged shape
    const vertices = [];
    const numVertices = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numVertices; i++) {
        const a = (i / numVertices) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.3);
        vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }

    return {
        id: Math.random().toString(36).substr(2, 9),
        x: x !== undefined ? x : Math.random() * CONFIG.worldWidth,
        y: y !== undefined ? y : Math.random() * CONFIG.worldHeight,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: radius,
        sizeIndex: sizeIndex,
        vertices: vertices,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.02
    };
}

export function updateRock(rock) {
    rock.x += rock.vx;
    rock.y += rock.vy;
    rock.rotation += rock.rotSpeed;
    wrapPosition(rock);
}

export function drawRock(ctx, rock) {
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.rotation);

    // Outer glow
    ctx.shadowColor = rock.glowColor || '#446';
    ctx.shadowBlur = 15 + rock.radius * 0.3;

    // Fill with dark gradient
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, rock.radius);
    gradient.addColorStop(0, '#3a3a4a');
    gradient.addColorStop(0.7, '#252530');
    gradient.addColorStop(1, '#1a1a22');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(rock.vertices[0].x, rock.vertices[0].y);
    for (let i = 1; i < rock.vertices.length; i++) {
        ctx.lineTo(rock.vertices[i].x, rock.vertices[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Edge highlight
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#667';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner edge glow
    ctx.strokeStyle = 'rgba(100, 120, 140, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
}

export function spawnInitialRocks(count) {
    const rocks = [];
    // Spawn more rocks for larger world
    const worldScale = (CONFIG.worldWidth * CONFIG.worldHeight) / (CONFIG.viewportWidth * CONFIG.viewportHeight);
    const scaledCount = Math.floor(count * worldScale);

    for (let i = 0; i < scaledCount; i++) {
        // Spawn away from center
        let x, y;
        do {
            x = Math.random() * CONFIG.worldWidth;
            y = Math.random() * CONFIG.worldHeight;
        } while (distance({ x, y }, { x: CONFIG.worldWidth / 2, y: CONFIG.worldHeight / 2 }) < 150);

        rocks.push(createRock(x, y, 0));
    }
    return rocks;
}
