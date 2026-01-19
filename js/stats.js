// ===========================================
// Lunar Defender - Stats & Events System
// ===========================================

import { CONFIG } from './config.js';

// ===========================================
// SESSION STATS
// ===========================================

export function createSessionStats() {
    return {
        rocksDestroyed: 0,
        shotsFired: 0,
        fuelUsed: 0,
        sessionStart: Date.now(),
        deaths: 0
    };
}

// ===========================================
// LIFETIME STATS
// ===========================================

export function createLifetimeStats() {
    return {
        rocksDestroyed: 0,
        shotsFired: 0,
        fuelUsed: 0,
        gamesPlayed: 0,
        timePlayed: 0,  // seconds
        deaths: 0,
        lastPlayed: null
    };
}

export function loadLifetimeStats() {
    try {
        const stored = localStorage.getItem('lunar_stats');
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Failed to load stats:', e);
    }
    return createLifetimeStats();
}

export function saveLifetimeStats(stats) {
    try {
        localStorage.setItem('lunar_stats', JSON.stringify(stats));
    } catch (e) {
        console.warn('Failed to save stats:', e);
    }
}

export function mergeSessionIntoLifetime(session, lifetime) {
    lifetime.rocksDestroyed += session.rocksDestroyed;
    lifetime.shotsFired += session.shotsFired;
    lifetime.fuelUsed += session.fuelUsed;
    lifetime.deaths += session.deaths;
    lifetime.timePlayed += Math.floor((Date.now() - session.sessionStart) / 1000);
    lifetime.gamesPlayed += 1;
    lifetime.lastPlayed = new Date().toISOString();
    return lifetime;
}

// ===========================================
// EVENT SYSTEM
// ===========================================

export const GameEvents = {
    ROCK_DESTROYED: 'rock_destroyed',
    SHOT_FIRED: 'shot_fired',
    THRUST_START: 'thrust_start',
    THRUST_STOP: 'thrust_stop',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_MINING: 'player_mining',
    PLAYER_UPGRADE: 'player_upgrade'
};

let eventLog = [];

export function getEventLog() {
    return eventLog;
}

export function clearEventLog() {
    eventLog = [];
}

export function createEvent(type, data) {
    return {
        type,
        timestamp: Date.now(),
        ...data
    };
}

export function logEvent(event) {
    eventLog.push(event);
    // Keep last 1000 events
    if (eventLog.length > 1000) {
        eventLog = eventLog.slice(-500);
    }
}

// Calculate fuel from thrust duration
export function calculateFuelUsed(ship, thrustStartTime) {
    if (!ship?.stats) return 0;

    let fuel = ship.stats.fuelUsed || 0;

    // Add current thrust session if active
    if (thrustStartTime) {
        const duration = (Date.now() - thrustStartTime) / 1000;
        fuel += duration * CONFIG.fuelPerThrust * 60; // Convert to fuel units
    }

    return fuel;
}
