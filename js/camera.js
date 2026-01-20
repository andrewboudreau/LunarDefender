// ===========================================
// Lunar Defender - Camera System
// Handles viewport into larger world with seamless wrapping
// ===========================================

import { CONFIG } from './config.js';

// Camera state - tracked in "unwrapped" space for smooth movement
let cameraX = 0;
let cameraY = 0;

// Track the ship's position in unwrapped space (accumulates real deltas)
let unwrappedTargetX = null;
let unwrappedTargetY = null;

// Track last frame's wrapped position to calculate deltas
let lastWrappedX = null;
let lastWrappedY = null;

const SMOOTHING = 0.1; // Camera lag for smooth follow

export function getCameraPosition() {
    return { x: cameraX, y: cameraY };
}

// Reset camera state (for new game)
export function resetCamera() {
    cameraX = 0;
    cameraY = 0;
    unwrappedTargetX = null;
    unwrappedTargetY = null;
    lastWrappedX = null;
    lastWrappedY = null;
}

// Update camera to follow a target (usually the player's ship)
// Key insight: camera tracks an "unwrapped" position that accumulates real movement
// This means the camera never jumps, even when the ship wraps around the world
export function updateCamera(target) {
    if (!target) return;

    // Ship's current position in wrapped world coordinates
    const wrappedX = target.x;
    const wrappedY = target.y;

    // First frame initialization
    if (lastWrappedX === null) {
        lastWrappedX = wrappedX;
        lastWrappedY = wrappedY;
        // Center camera on ship
        unwrappedTargetX = wrappedX - CONFIG.viewportWidth / 2;
        unwrappedTargetY = wrappedY - CONFIG.viewportHeight / 2;
        cameraX = unwrappedTargetX;
        cameraY = unwrappedTargetY;
        return;
    }

    // Calculate how the ship actually moved this frame
    let deltaX = wrappedX - lastWrappedX;
    let deltaY = wrappedY - lastWrappedY;

    // Detect wrapping: if delta > half world, ship wrapped around
    if (deltaX > CONFIG.worldWidth / 2) deltaX -= CONFIG.worldWidth;
    if (deltaX < -CONFIG.worldWidth / 2) deltaX += CONFIG.worldWidth;
    if (deltaY > CONFIG.worldHeight / 2) deltaY -= CONFIG.worldHeight;
    if (deltaY < -CONFIG.worldHeight / 2) deltaY += CONFIG.worldHeight;

    // Save for next frame's delta calculation
    lastWrappedX = wrappedX;
    lastWrappedY = wrappedY;

    // Move the unwrapped target by the actual movement delta
    // This accumulates smoothly even when ship wraps
    unwrappedTargetX += deltaX;
    unwrappedTargetY += deltaY;

    // Camera smoothly follows the unwrapped target
    cameraX += (unwrappedTargetX - cameraX) * SMOOTHING;
    cameraY += (unwrappedTargetY - cameraY) * SMOOTHING;

    // Re-anchor camera if it drifts too far from the valid world range
    // This prevents the camera from accumulating unbounded values while
    // still allowing smooth transitions across wrap boundaries
    if (cameraX > CONFIG.worldWidth) {
        cameraX -= CONFIG.worldWidth;
        unwrappedTargetX -= CONFIG.worldWidth;
    } else if (cameraX < -CONFIG.viewportWidth) {
        cameraX += CONFIG.worldWidth;
        unwrappedTargetX += CONFIG.worldWidth;
    }
    if (cameraY > CONFIG.worldHeight) {
        cameraY -= CONFIG.worldHeight;
        unwrappedTargetY -= CONFIG.worldHeight;
    } else if (cameraY < -CONFIG.viewportHeight) {
        cameraY += CONFIG.worldHeight;
        unwrappedTargetY += CONFIG.worldHeight;
    }
}

// Wrap a value to 0..max range
function wrapValue(val, max) {
    return ((val % max) + max) % max;
}

// Snap camera instantly to target (for init or teleport)
export function snapCamera(target) {
    if (!target) return;
    cameraX = target.x - CONFIG.viewportWidth / 2;
    cameraY = target.y - CONFIG.viewportHeight / 2;
    unwrappedTargetX = cameraX;
    unwrappedTargetY = cameraY;
    lastWrappedX = target.x;
    lastWrappedY = target.y;
}

// Convert world coordinates to screen coordinates
export function worldToScreen(worldX, worldY) {
    return {
        x: worldX - cameraX,
        y: worldY - cameraY
    };
}

// Convert screen coordinates to world coordinates
export function screenToWorld(screenX, screenY) {
    return {
        x: screenX + cameraX,
        y: screenY + cameraY
    };
}

// Check if a point (with radius) is visible on screen
// Returns array of screen positions where object should be drawn
// (can be multiple for wrapped objects near edges)
export function getVisiblePositions(worldX, worldY, radius = 0) {
    const positions = [];
    const padding = radius + 50; // Extra padding for smooth appearance

    // Generate all possible wrapped positions
    const wrappedPositions = [
        { x: worldX, y: worldY },
        { x: worldX - CONFIG.worldWidth, y: worldY },
        { x: worldX + CONFIG.worldWidth, y: worldY },
        { x: worldX, y: worldY - CONFIG.worldHeight },
        { x: worldX, y: worldY + CONFIG.worldHeight },
        { x: worldX - CONFIG.worldWidth, y: worldY - CONFIG.worldHeight },
        { x: worldX + CONFIG.worldWidth, y: worldY - CONFIG.worldHeight },
        { x: worldX - CONFIG.worldWidth, y: worldY + CONFIG.worldHeight },
        { x: worldX + CONFIG.worldWidth, y: worldY + CONFIG.worldHeight },
    ];

    for (const pos of wrappedPositions) {
        const screen = worldToScreen(pos.x, pos.y);

        // Check if this position is visible on screen
        if (screen.x + padding >= 0 &&
            screen.x - padding <= CONFIG.viewportWidth &&
            screen.y + padding >= 0 &&
            screen.y - padding <= CONFIG.viewportHeight) {
            positions.push(screen);
        }
    }

    return positions;
}

// Wrap world coordinates (for physics)
export function wrapWorldPosition(obj) {
    // Wrap X
    if (obj.x < 0) obj.x += CONFIG.worldWidth;
    if (obj.x >= CONFIG.worldWidth) obj.x -= CONFIG.worldWidth;

    // Wrap Y
    if (obj.y < 0) obj.y += CONFIG.worldHeight;
    if (obj.y >= CONFIG.worldHeight) obj.y -= CONFIG.worldHeight;
}

// Calculate shortest distance between two points in wrapped world
export function wrappedDistance(a, b) {
    let dx = Math.abs(a.x - b.x);
    let dy = Math.abs(a.y - b.y);

    // Check if wrapping gives shorter distance
    if (dx > CONFIG.worldWidth / 2) dx = CONFIG.worldWidth - dx;
    if (dy > CONFIG.worldHeight / 2) dy = CONFIG.worldHeight - dy;

    return Math.sqrt(dx * dx + dy * dy);
}

// Get direction vector from a to b in wrapped world (for homing missiles etc)
export function wrappedDirection(from, to) {
    let dx = to.x - from.x;
    let dy = to.y - from.y;

    // Check if wrapping gives shorter path
    if (dx > CONFIG.worldWidth / 2) dx -= CONFIG.worldWidth;
    if (dx < -CONFIG.worldWidth / 2) dx += CONFIG.worldWidth;
    if (dy > CONFIG.worldHeight / 2) dy -= CONFIG.worldHeight;
    if (dy < -CONFIG.worldHeight / 2) dy += CONFIG.worldHeight;

    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return { x: 0, y: 0 };

    return { x: dx / dist, y: dy / dist };
}
