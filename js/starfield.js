// ===========================================
// Lunar Defender - Starfield Background System
// ===========================================

import { CONFIG } from './config.js';

let stars = [];
let nebulas = [];

export function initStarfield() {
    stars = [];
    nebulas = [];

    // Layer 1: Distant static stars (tiny, dim)
    for (let i = 0; i < 150; i++) {
        stars.push({
            x: Math.random() * CONFIG.width,
            y: Math.random() * CONFIG.height,
            size: 0.5 + Math.random() * 0.5,
            brightness: 0.2 + Math.random() * 0.3,
            speed: 0,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.02 + Math.random() * 0.03
        });
    }

    // Layer 2: Mid-distance stars (slow drift)
    for (let i = 0; i < 80; i++) {
        stars.push({
            x: Math.random() * CONFIG.width,
            y: Math.random() * CONFIG.height,
            size: 0.8 + Math.random() * 1,
            brightness: 0.4 + Math.random() * 0.3,
            speed: 0.1 + Math.random() * 0.2,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.01 + Math.random() * 0.02,
            color: Math.random() > 0.8 ? '#aaf' : (Math.random() > 0.5 ? '#ffa' : '#fff')
        });
    }

    // Layer 3: Closer stars (more drift, brighter)
    for (let i = 0; i < 30; i++) {
        stars.push({
            x: Math.random() * CONFIG.width,
            y: Math.random() * CONFIG.height,
            size: 1.5 + Math.random() * 1.5,
            brightness: 0.6 + Math.random() * 0.4,
            speed: 0.3 + Math.random() * 0.3,
            twinkle: Math.random() * Math.PI * 2,
            twinkleSpeed: 0.005 + Math.random() * 0.01,
            glow: true,
            color: Math.random() > 0.7 ? '#8af' : (Math.random() > 0.5 ? '#fa8' : '#fff')
        });
    }

    // Nebulas - large color clouds
    const nebulaColors = [
        { r: 60, g: 20, b: 80 },   // Purple
        { r: 20, g: 40, b: 80 },   // Blue
        { r: 80, g: 30, b: 50 },   // Magenta
        { r: 20, g: 60, b: 60 },   // Teal
        { r: 50, g: 20, b: 30 }    // Dark red
    ];

    for (let i = 0; i < 4; i++) {
        const color = nebulaColors[Math.floor(Math.random() * nebulaColors.length)];
        nebulas.push({
            x: Math.random() * CONFIG.width,
            y: Math.random() * CONFIG.height,
            radius: 150 + Math.random() * 250,
            color: color,
            opacity: 0.03 + Math.random() * 0.04,
            drift: { x: (Math.random() - 0.5) * 0.05, y: (Math.random() - 0.5) * 0.05 }
        });
    }
}

export function updateStarfield() {
    // Update star positions (parallax)
    for (const star of stars) {
        if (star.speed > 0) {
            star.x -= star.speed;
            if (star.x < 0) star.x = CONFIG.width;
        }
        star.twinkle += star.twinkleSpeed;
    }

    // Drift nebulas slowly
    for (const neb of nebulas) {
        neb.x += neb.drift.x;
        neb.y += neb.drift.y;
        // Wrap around
        if (neb.x < -neb.radius) neb.x = CONFIG.width + neb.radius;
        if (neb.x > CONFIG.width + neb.radius) neb.x = -neb.radius;
        if (neb.y < -neb.radius) neb.y = CONFIG.height + neb.radius;
        if (neb.y > CONFIG.height + neb.radius) neb.y = -neb.radius;
    }
}

export function renderStarfield(ctx) {
    // Draw nebulas first (behind everything)
    for (const neb of nebulas) {
        const gradient = ctx.createRadialGradient(
            neb.x, neb.y, 0,
            neb.x, neb.y, neb.radius
        );
        gradient.addColorStop(0, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity})`);
        gradient.addColorStop(0.5, `rgba(${neb.color.r}, ${neb.color.g}, ${neb.color.b}, ${neb.opacity * 0.5})`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw stars
    for (const star of stars) {
        const twinkleBrightness = star.brightness * (0.7 + 0.3 * Math.sin(star.twinkle));
        ctx.globalAlpha = twinkleBrightness;

        if (star.glow) {
            ctx.shadowColor = star.color || '#fff';
            ctx.shadowBlur = star.size * 4;
        }

        ctx.fillStyle = star.color || '#fff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}
