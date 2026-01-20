// ===========================================
// Lunar Defender - Starfield Background System
// World-positioned stars with seeded RNG for consistency
// ===========================================

import { CONFIG } from './config.js';
import { getCameraPosition, getVisiblePositions } from './camera.js';

let stars = [];
let nebulas = [];
let currentSeed = 12345;

// Seeded random number generator (mulberry32)
function seededRandom(seed) {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function initStarfield(seed) {
    stars = [];
    nebulas = [];

    // Use provided seed or default
    currentSeed = seed || 12345;
    const rand = seededRandom(currentSeed);

    // Layer 1: Distant static stars (tiny, dim) - world positioned
    for (let i = 0; i < 400; i++) {
        stars.push({
            x: rand() * CONFIG.worldWidth,
            y: rand() * CONFIG.worldHeight,
            size: 0.5 + rand() * 0.5,
            brightness: 0.2 + rand() * 0.3,
            parallax: 0.3, // Moves slower than camera (distant)
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.02 + rand() * 0.03
        });
    }

    // Layer 2: Mid-distance stars
    for (let i = 0; i < 200; i++) {
        const colorRoll = rand();
        stars.push({
            x: rand() * CONFIG.worldWidth,
            y: rand() * CONFIG.worldHeight,
            size: 0.8 + rand() * 1,
            brightness: 0.4 + rand() * 0.3,
            parallax: 0.5,
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.01 + rand() * 0.02,
            color: colorRoll > 0.8 ? '#aaf' : (colorRoll > 0.5 ? '#ffa' : '#fff')
        });
    }

    // Layer 3: Closer stars (brighter, more parallax)
    for (let i = 0; i < 80; i++) {
        const colorRoll = rand();
        stars.push({
            x: rand() * CONFIG.worldWidth,
            y: rand() * CONFIG.worldHeight,
            size: 1.5 + rand() * 1.5,
            brightness: 0.6 + rand() * 0.4,
            parallax: 0.8,
            twinkle: rand() * Math.PI * 2,
            twinkleSpeed: 0.005 + rand() * 0.01,
            glow: true,
            color: colorRoll > 0.7 ? '#8af' : (colorRoll > 0.5 ? '#fa8' : '#fff')
        });
    }

    // Nebulas - large color clouds at world positions
    const nebulaColors = [
        { r: 60, g: 20, b: 80 },   // Purple
        { r: 20, g: 40, b: 80 },   // Blue
        { r: 80, g: 30, b: 50 },   // Magenta
        { r: 20, g: 60, b: 60 },   // Teal
        { r: 50, g: 20, b: 30 }    // Dark red
    ];

    for (let i = 0; i < 8; i++) {
        const colorIndex = Math.floor(rand() * nebulaColors.length);
        nebulas.push({
            x: rand() * CONFIG.worldWidth,
            y: rand() * CONFIG.worldHeight,
            radius: 200 + rand() * 350,
            color: nebulaColors[colorIndex],
            opacity: 0.03 + rand() * 0.04,
            parallax: 0.2 // Very distant
        });
    }
}

export function getSeed() {
    return currentSeed;
}

export function updateStarfield() {
    // Stars are fixed in world space - only update twinkle animation
    for (const star of stars) {
        star.twinkle += star.twinkleSpeed;
    }
}

// Helper to get screen position with parallax and wrapping
function getScreenPos(worldX, worldY, parallax, camera) {
    // Apply parallax - distant objects move less with camera
    let screenX = worldX - camera.x * parallax;
    let screenY = worldY - camera.y * parallax;

    // Wrap to keep stars visible (tile the starfield)
    const wrapWidth = CONFIG.worldWidth * parallax;
    const wrapHeight = CONFIG.worldHeight * parallax;

    // Normalize to viewport
    screenX = ((screenX % wrapWidth) + wrapWidth) % wrapWidth;
    screenY = ((screenY % wrapHeight) + wrapHeight) % wrapHeight;

    // Scale to fill viewport even with parallax
    screenX = (screenX / wrapWidth) * CONFIG.viewportWidth;
    screenY = (screenY / wrapHeight) * CONFIG.viewportHeight;

    return { x: screenX, y: screenY };
}

export function renderStarfield(ctx) {
    const camera = getCameraPosition();

    // Draw nebulas first (behind everything)
    for (const neb of nebulas) {
        const pos = getScreenPos(neb.x, neb.y, neb.parallax, camera);

        // Scale radius for viewport
        const scaledRadius = neb.radius * (CONFIG.viewportWidth / CONFIG.worldWidth) / neb.parallax;

        const gradient = ctx.createRadialGradient(
            pos.x, pos.y, 0,
            pos.x, pos.y, scaledRadius
        );
        gradient.addColorStop(0, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity})`);
        gradient.addColorStop(0.5, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity * 0.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, scaledRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw stars with parallax
    for (const star of stars) {
        const pos = getScreenPos(star.x, star.y, star.parallax, camera);

        const twinkleBrightness = star.brightness * (0.7 + 0.3 * Math.sin(star.twinkle));
        ctx.globalAlpha = twinkleBrightness;

        if (star.glow) {
            ctx.shadowColor = star.color || '#fff';
            ctx.shadowBlur = star.size * 4;
        }

        ctx.fillStyle = star.color || '#fff';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}
