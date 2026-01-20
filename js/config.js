// ===========================================
// Lunar Defender - Configuration & Constants
// ===========================================

export const CONFIG = {
    // Viewport (what you see)
    viewportWidth: 1200,
    viewportHeight: 800,

    // World (total playable area) - 3x3 viewports
    worldWidth: 3600,
    worldHeight: 2400,

    // Legacy aliases (for backward compat during transition)
    get width() { return this.viewportWidth; },
    get height() { return this.viewportHeight; },

    shipSize: 20,
    shipThrust: 0.08,
    shipMaxSpeed: 6,
    shipFriction: 0.995,
    shipRotSpeed: 0.05,
    bulletSpeed: 5,
    bulletLife: 80,
    rockSizes: [40, 25, 15],
    rockSpeed: 1.2,
    initialRocks: 5,
    networkTickRate: 50,
    fuelPerThrust: 0.1,
    miningDistance: 60,     // How close to rock to start mining
};

export const LANDER_CONFIG = {
    gravity: 0.015,
    thrust: 0.04,
    rotSpeed: 0.04,
    maxFuel: 100,
    fuelUsage: 0.3,
    maxLandingSpeed: 1.5,
    maxLandingAngle: 0.4,   // radians from vertical
    terrainSegments: 40,
    landingPadCount: 3
};

export const PlayerState = {
    FLYING: 'flying',
    MINING: 'mining'        // In lunar lander mini-game
};

// Nickname generation lists
export const ADJECTIVES = [
    'Swift', 'Cosmic', 'Stellar', 'Lunar', 'Solar', 'Atomic', 'Turbo', 'Hyper',
    'Neon', 'Plasma', 'Quantum', 'Astral', 'Blazing', 'Electric', 'Frozen', 'Golden'
];

export const NOUNS = [
    'Pilot', 'Comet', 'Rocket', 'Falcon', 'Phoenix', 'Ranger', 'Voyager', 'Pioneer',
    'Hunter', 'Drifter', 'Striker', 'Blaster', 'Cruiser', 'Phantom', 'Spark', 'Nova'
];
