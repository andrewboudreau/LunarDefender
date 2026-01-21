// Lunar Defender - Co-op Space Rocks Game
// Uses PeerJS for WebRTC multiplayer

// ============== GAME CONFIG ==============
const CONFIG = {
    width: 1200,
    height: 800,
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

// ============== PLAYER STATES ==============
const PlayerState = {
    FLYING: 'flying',
    MINING: 'mining'        // In lunar lander mini-game
};

// ============== UPGRADES ==============
const UPGRADES = {
    SPREAD_SHOT: {
        id: 'spread_shot',
        name: 'Spread Shot',
        desc: 'Fire 3 bullets in a cone',
        color: '#f4a',
        ammo: 30,
        type: 'primary'  // Modifies primary fire
    },
    RAPID_FIRE: {
        id: 'rapid_fire',
        name: 'Rapid Fire',
        desc: 'Shoot twice as fast',
        color: '#fa4',
        ammo: 50,
        type: 'primary'
    },
    EXPLOSIVES: {
        id: 'explosives',
        name: 'Explosive Rounds',
        desc: 'Bullets explode on impact',
        color: '#f44',
        ammo: 15,
        type: 'primary'
    },
    SHIELD: {
        id: 'shield',
        name: 'Energy Shield',
        desc: 'Protect from one crash',
        color: '#4af',
        ammo: 1,
        type: 'passive'  // Always active until used
    },
    BIG_BULLETS: {
        id: 'big_bullets',
        name: 'Heavy Rounds',
        desc: 'Larger, more powerful shots',
        color: '#a4f',
        ammo: 20,
        type: 'primary'
    },
    HOMING_MISSILES: {
        id: 'homing_missiles',
        name: 'Homing Missiles',
        desc: 'Lock-on missiles that track rocks',
        color: '#4ff',
        ammo: 8,
        type: 'secondary'  // Alt-fire weapon
    },
    PROXIMITY_MINES: {
        id: 'proximity_mines',
        name: 'Proximity Mines',
        desc: 'Deploy mines that explode near rocks',
        color: '#f4f',
        ammo: 5,
        type: 'secondary'
    }
};

function getRandomUpgrade() {
    const keys = Object.keys(UPGRADES);
    return UPGRADES[keys[Math.floor(Math.random() * keys.length)]];
}

// Get upgrade with ammo for a ship
function getShipUpgrade(ship, upgradeId) {
    if (!ship || !ship.upgrades) return null;
    return ship.upgrades.find(u => u.id === upgradeId);
}

function hasUpgrade(ship, upgradeId) {
    const upgrade = getShipUpgrade(ship, upgradeId);
    return upgrade && upgrade.ammo > 0;
}

function useUpgradeAmmo(ship, upgradeId, amount = 1) {
    const upgrade = getShipUpgrade(ship, upgradeId);
    if (upgrade) {
        upgrade.ammo -= amount;
        if (upgrade.ammo <= 0) {
            // Remove depleted upgrade
            ship.upgrades = ship.upgrades.filter(u => u.id !== upgradeId);
            return true; // Was depleted
        }
    }
    return false;
}

function addUpgradeToShip(ship, upgradeData) {
    if (!ship.upgrades) ship.upgrades = [];

    // Check if we already have this upgrade
    const existing = ship.upgrades.find(u => u.id === upgradeData.id);
    if (existing) {
        // Add ammo to existing
        existing.ammo += upgradeData.ammo;
    } else {
        // Add new upgrade with ammo
        ship.upgrades.push({
            id: upgradeData.id,
            ammo: upgradeData.ammo,
            type: upgradeData.type
        });
    }
}

// ============== AUDIO SYSTEM ==============
let audioCtx = null;
let masterGain = null;
let thrustGain = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
}

function ensureAudio() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Shoot sound - dense bassy "pew"
function playShoot() {
    ensureAudio();
    const t = audioCtx.currentTime;

    // Bass tone - low frequency for punch
    const bass = audioCtx.createOscillator();
    const bassGain = audioCtx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(180, t);
    bass.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    bassGain.gain.setValueAtTime(0.25, t);
    bassGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    bass.connect(bassGain);
    bassGain.connect(masterGain);
    bass.start(t);
    bass.stop(t + 0.1);

    // Mid tone for body
    const mid = audioCtx.createOscillator();
    const midGain = audioCtx.createGain();
    mid.type = 'triangle';
    mid.frequency.setValueAtTime(250, t);
    mid.frequency.exponentialRampToValueAtTime(100, t + 0.08);
    midGain.gain.setValueAtTime(0.15, t);
    midGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

    const midFilter = audioCtx.createBiquadFilter();
    midFilter.type = 'lowpass';
    midFilter.frequency.value = 600;

    mid.connect(midFilter);
    midFilter.connect(midGain);
    midGain.connect(masterGain);
    mid.start(t);
    mid.stop(t + 0.08);

    // Dense noise layer
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.06);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        const env = Math.pow(1 - i / bufferSize, 1.5);
        data[i] = (Math.random() * 2 - 1) * env;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 500;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.18;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(t);
}

// Rock chonk and crack sound
function playExplosion(size = 0) {
    ensureAudio();

    const t = audioCtx.currentTime;

    // THE CHONK - deep bass hit with quick attack
    const chonk = audioCtx.createOscillator();
    const chonkGain = audioCtx.createGain();
    chonk.type = 'sine';
    chonk.frequency.setValueAtTime(65 - size * 10, t);
    chonk.frequency.exponentialRampToValueAtTime(25, t + 0.12);
    chonkGain.gain.setValueAtTime(0.5, t);
    chonkGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    chonk.connect(chonkGain);
    chonkGain.connect(masterGain);
    chonk.start(t);
    chonk.stop(t + 0.12);

    // Sub bass layer for extra weight
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(40, t);
    sub.frequency.exponentialRampToValueAtTime(20, t + 0.1);
    subGain.gain.setValueAtTime(0.35, t);
    subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    sub.connect(subGain);
    subGain.connect(masterGain);
    sub.start(t);
    sub.stop(t + 0.1);

    // Short crack snap - low-mid punch
    const crack = audioCtx.createOscillator();
    const crackGain = audioCtx.createGain();
    crack.type = 'square';
    crack.frequency.setValueAtTime(120, t);
    crack.frequency.exponentialRampToValueAtTime(40, t + 0.03);
    crackGain.gain.setValueAtTime(0.12, t);
    crackGain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);

    const crackFilter = audioCtx.createBiquadFilter();
    crackFilter.type = 'lowpass';
    crackFilter.frequency.value = 400;

    crack.connect(crackFilter);
    crackFilter.connect(crackGain);
    crackGain.connect(masterGain);
    crack.start(t);
    crack.stop(t + 0.03);

    // Low rumble debris
    const rumbleSize = Math.floor(audioCtx.sampleRate * 0.08);
    const rumbleBuffer = audioCtx.createBuffer(1, rumbleSize, audioCtx.sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    for (let i = 0; i < rumbleSize; i++) {
        const env = Math.pow(1 - i / rumbleSize, 1.5);
        rumbleData[i] = (Math.random() * 2 - 1) * env;
    }

    const rumble = audioCtx.createBufferSource();
    rumble.buffer = rumbleBuffer;

    const rumbleFilter = audioCtx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 200;

    const rumbleGain = audioCtx.createGain();
    rumbleGain.gain.value = 0.25;

    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(masterGain);
    rumble.start(t);
}

// Thrust sound - soft white noise with bass
let thrustNoise = null;
let thrustFilter = null;

function startThrust() {
    ensureAudio();
    if (thrustNoise) return;

    // Create noise buffer
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    thrustNoise = audioCtx.createBufferSource();
    thrustNoise.buffer = buffer;
    thrustNoise.loop = true;

    // Low-pass filter for soft bass rumble
    thrustFilter = audioCtx.createBiquadFilter();
    thrustFilter.type = 'lowpass';
    thrustFilter.frequency.value = 150;
    thrustFilter.Q.value = 1;

    thrustGain = audioCtx.createGain();
    thrustGain.gain.setValueAtTime(0, audioCtx.currentTime);
    thrustGain.gain.linearRampToValueAtTime(0.45, audioCtx.currentTime + 0.15);

    thrustNoise.connect(thrustFilter);
    thrustFilter.connect(thrustGain);
    thrustGain.connect(masterGain);
    thrustNoise.start();
}

function stopThrust() {
    if (!thrustNoise) return;
    thrustGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
    const noise = thrustNoise;
    setTimeout(() => {
        noise.stop();
    }, 200);
    thrustNoise = null;
    thrustFilter = null;
    thrustGain = null;
}

// Chime - pleasant ascending notes
function playChime() {
    ensureAudio();
    const notes = [523, 659, 784]; // C5, E5, G5
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + i * 0.1 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.3);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(audioCtx.currentTime + i * 0.1);
        osc.stop(audioCtx.currentTime + i * 0.1 + 0.3);
    });
}

// Success fanfare - for upgrades and landing
function playSuccess() {
    ensureAudio();
    const notes = [392, 523, 659, 784]; // G4, C5, E5, G5
    notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, audioCtx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + i * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.4);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(audioCtx.currentTime + i * 0.12);
        osc.stop(audioCtx.currentTime + i * 0.12 + 0.4);
    });
}

// Crash sound - harsh noise burst
function playCrash() {
    ensureAudio();
    const duration = 0.5;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
    }
    const noise = audioCtx.createBufferSource();
    const gain = audioCtx.createGain();
    noise.buffer = buffer;
    gain.gain.value = 0.4;
    noise.connect(gain);
    gain.connect(masterGain);
    noise.start();
}

// Click sound - for UI
function playClick() {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
}

// ============== PARTICLE SYSTEM ==============
let particles = [];

function createParticle(x, y, vx, vy, color, life, size) {
    return {
        x, y, vx, vy,
        color: color || '#fff',
        life: life || 60,
        maxLife: life || 60,
        size: size || 2
    };
}

function spawnExplosionParticles(x, y, count, color, speed) {
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

function spawnThrustParticle(ship) {
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

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life--;

        if (p.life <= 0) {
            particles.splice(i, 1);
        }
    }
}

function renderParticles() {
    for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;

        // Glow effect for bright particles
        if (p.glow) {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = p.size * 3;
        }

        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.3 + alpha * 0.7), 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
}

// ============== STARFIELD SYSTEM ==============
let stars = [];
let nebulas = [];

function initStarfield() {
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

function updateStarfield() {
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

function renderStarfield() {
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

// ============== LUNAR LANDER CONFIG ==============
const LANDER_CONFIG = {
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

// ============== USER IDENTITY ==============
const ADJECTIVES = [
    'Swift', 'Cosmic', 'Stellar', 'Lunar', 'Solar', 'Atomic', 'Turbo', 'Hyper',
    'Neon', 'Plasma', 'Quantum', 'Astral', 'Blazing', 'Electric', 'Frozen', 'Golden'
];
const NOUNS = [
    'Pilot', 'Comet', 'Rocket', 'Falcon', 'Phoenix', 'Ranger', 'Voyager', 'Pioneer',
    'Hunter', 'Drifter', 'Striker', 'Blaster', 'Cruiser', 'Phantom', 'Spark', 'Nova'
];

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
}

function generateNickname() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}${noun}${num}`;
}

function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function getOrCreateUserId() {
    let userId = getCookie('lunar_user_id');
    if (!userId) {
        userId = generateUserId();
        setCookie('lunar_user_id', userId);
    }
    return userId;
}

function getDisplayName() {
    return getCookie('lunar_display_name') || null;
}

function setDisplayName(name) {
    setCookie('lunar_display_name', name.trim().substring(0, 20));
}

function getPlayerName() {
    let name = getDisplayName();
    if (!name) {
        name = generateNickname();
        setDisplayName(name);
    }
    return name;
}

// ============== STATS SYSTEM ==============
function createSessionStats() {
    return {
        rocksDestroyed: 0,
        shotsFired: 0,
        fuelUsed: 0,
        sessionStart: Date.now(),
        deaths: 0
    };
}

function createLifetimeStats() {
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

function loadLifetimeStats() {
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

function saveLifetimeStats(stats) {
    try {
        localStorage.setItem('lunar_stats', JSON.stringify(stats));
    } catch (e) {
        console.warn('Failed to save stats:', e);
    }
}

function mergeSessionIntoLifetime(session, lifetime) {
    lifetime.rocksDestroyed += session.rocksDestroyed;
    lifetime.shotsFired += session.shotsFired;
    lifetime.fuelUsed += session.fuelUsed;
    lifetime.deaths += session.deaths;
    lifetime.timePlayed += Math.floor((Date.now() - session.sessionStart) / 1000);
    lifetime.gamesPlayed += 1;
    lifetime.lastPlayed = new Date().toISOString();
    return lifetime;
}

// Global stats objects
let mySessionStats = null;
let myLifetimeStats = null;

// ============== EVENT SYSTEM ==============
// Events are the unit of truth for stats - witnessable by all peers
const GameEvents = {
    ROCK_DESTROYED: 'rock_destroyed',
    SHOT_FIRED: 'shot_fired',
    THRUST_START: 'thrust_start',
    THRUST_STOP: 'thrust_stop',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left',
    PLAYER_MINING: 'player_mining',
    PLAYER_UPGRADE: 'player_upgrade'
};

let eventLog = []; // Host maintains event log
let thrustStartTime = {}; // Track when each player started thrusting

function createEvent(type, data) {
    return {
        type,
        timestamp: Date.now(),
        ...data
    };
}

function logEvent(event) {
    eventLog.push(event);
    // Keep last 1000 events
    if (eventLog.length > 1000) {
        eventLog = eventLog.slice(-500);
    }
}

function broadcastEvent(event) {
    if (!isHost) return;

    logEvent(event);

    // Handle event locally for the host
    handleGameEvent(event);

    // Send to all clients
    connections.forEach(conn => {
        if (conn.open) {
            conn.send({ type: 'event', event });
        }
    });
}

function handleGameEvent(event) {
    // Note: logEvent is called by broadcastEvent, so we don't need to call it again for host
    // For clients receiving events, we log them here
    if (!isHost) {
        logEvent(event);
    }

    // Update stats based on event
    switch (event.type) {
        case GameEvents.ROCK_DESTROYED:
            if (ships[event.playerId]?.stats) {
                ships[event.playerId].stats.rocksDestroyed++;
            }
            break;
        case GameEvents.SHOT_FIRED:
            if (ships[event.playerId]?.stats) {
                ships[event.playerId].stats.shotsFired++;
            }
            break;
    }
}

// Calculate fuel from thrust duration
function calculateFuelUsed(playerId) {
    const ship = ships[playerId];
    if (!ship?.stats) return 0;

    let fuel = ship.stats.fuelUsed || 0;

    // Add current thrust session if active
    if (thrustStartTime[playerId]) {
        const duration = (Date.now() - thrustStartTime[playerId]) / 1000;
        fuel += duration * CONFIG.fuelPerThrust * 60; // Convert to fuel units
    }

    return fuel;
}

function saveCurrentStats() {
    if (!gameRunning || !myId || !ships[myId]) return;

    const myShip = ships[myId];
    if (myShip && myShip.stats) {
        // Create a copy of current session for merging
        const sessionCopy = { ...myShip.stats };

        // Merge into lifetime (but don't double-count - track what we've already saved)
        if (!myShip.stats._lastSaved) {
            myShip.stats._lastSaved = createSessionStats();
        }

        // Calculate delta since last save
        const delta = {
            rocksDestroyed: sessionCopy.rocksDestroyed - myShip.stats._lastSaved.rocksDestroyed,
            shotsFired: sessionCopy.shotsFired - myShip.stats._lastSaved.shotsFired,
            fuelUsed: sessionCopy.fuelUsed - myShip.stats._lastSaved.fuelUsed,
            deaths: sessionCopy.deaths - myShip.stats._lastSaved.deaths,
            sessionStart: sessionCopy.sessionStart
        };

        // Only save if there's new data
        if (delta.rocksDestroyed > 0 || delta.shotsFired > 0 || delta.fuelUsed > 0) {
            myLifetimeStats.rocksDestroyed += delta.rocksDestroyed;
            myLifetimeStats.shotsFired += delta.shotsFired;
            myLifetimeStats.fuelUsed += delta.fuelUsed;
            myLifetimeStats.deaths += delta.deaths;
            myLifetimeStats.lastPlayed = new Date().toISOString();

            saveLifetimeStats(myLifetimeStats);
            console.log('Stats saved:', delta);

            // Update last saved reference
            myShip.stats._lastSaved = { ...sessionCopy };
        }
    }
}

// ============== GAME STATE ==============
let canvas, ctx;
let isHost = false;
let isBot = false;
let gameRunning = false;
let myId = null;
let myUserId = null;
let myName = null;
let currentRoomCode = null;  // Store room code for sharing
let peer = null;
let connections = []; // For host: all client connections
let hostConnection = null; // For client: connection to host

// Game objects (host authoritative)
let ships = {}; // { odspeeId: shipObject }
let rocks = [];
let bullets = [];
let missiles = [];  // Homing missiles
let mines = [];     // Proximity mines

// ============== CLIENT INTERPOLATION ==============
// State buffering for smooth client-side rendering
let interpolation = {
    enabled: true,
    previousState: null,    // Previous network state
    targetState: null,      // Most recent network state
    lastUpdateTime: 0,      // When we received the last state
    renderTime: 0           // Current interpolation time
};

// Linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Angle interpolation (handles wraparound)
function lerpAngle(a, b, t) {
    let diff = b - a;
    // Normalize to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
}

// Position interpolation with world wrapping
function lerpPositionWrapped(prev, target, t, maxVal) {
    let diff = target - prev;
    // If the difference is more than half the world, we wrapped
    if (Math.abs(diff) > maxVal / 2) {
        // Entity wrapped around - adjust for shortest path
        if (diff > 0) {
            prev += maxVal;
        } else {
            target += maxVal;
        }
        let result = lerp(prev, target, t);
        // Normalize back to valid range
        if (result >= maxVal) result -= maxVal;
        if (result < 0) result += maxVal;
        return result;
    }
    return lerp(prev, target, t);
}

// Get interpolated position for an entity
function getInterpolatedEntity(prevEntity, targetEntity, t) {
    if (!prevEntity) return targetEntity;
    if (!targetEntity) return prevEntity;

    return {
        ...targetEntity,
        x: lerpPositionWrapped(prevEntity.x, targetEntity.x, t, CONFIG.width),
        y: lerpPositionWrapped(prevEntity.y, targetEntity.y, t, CONFIG.height),
        angle: prevEntity.angle !== undefined ? lerpAngle(prevEntity.angle, targetEntity.angle, t) : targetEntity.angle,
        rotation: prevEntity.rotation !== undefined ? lerpAngle(prevEntity.rotation, targetEntity.rotation, t) : targetEntity.rotation
    };
}

// Local input state
let keys = {
    left: false,
    right: false,
    up: false,
    space: false,
    mine: false,    // E key for mining
    altFire: false  // Q key for secondary weapons
};
let lastShot = 0;
let lastAltFire = 0;

// ============== SHARING & INVITES ==============
function getInviteUrl(roomCode) {
    const url = new URL(window.location.href);
    url.search = ''; // Clear existing params
    url.searchParams.set('join', roomCode);
    return url.toString();
}

async function shareGame(roomCode) {
    const url = getInviteUrl(roomCode);
    const shareData = {
        title: 'Lunar Defender',
        text: `Join my game! Code: ${roomCode}`,
        url: url
    };

    const statusEl = document.getElementById('share-status');

    // Try native share first (mobile)
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            if (statusEl) statusEl.textContent = 'Shared!';
            return true;
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.log('Share failed, falling back to clipboard');
            }
        }
    }

    // Fallback: copy to clipboard
    try {
        await navigator.clipboard.writeText(url);
        if (statusEl) {
            statusEl.textContent = 'Link copied!';
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
        }
        return true;
    } catch (err) {
        // Final fallback: show URL
        if (statusEl) statusEl.textContent = url;
        return false;
    }
}

function checkAutoJoin() {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');

    if (joinCode && joinCode.length === 6) {
        console.log('Auto-joining room:', joinCode);

        // Switch to join menu and fill in code
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('join-menu').classList.remove('hidden');
        document.getElementById('room-input').value = joinCode.toUpperCase();

        // Auto-connect after a short delay
        setTimeout(() => {
            setupClient(joinCode.toUpperCase());
        }, 500);

        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);

        return true;
    }
    return false;
}

// ============== UTILITIES ==============
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function randomColor() {
    const colors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];
    return colors[Math.floor(Math.random() * colors.length)];
}

function wrapPosition(obj) {
    if (obj.x < 0) obj.x = CONFIG.width;
    if (obj.x > CONFIG.width) obj.x = 0;
    if (obj.y < 0) obj.y = CONFIG.height;
    if (obj.y > CONFIG.height) obj.y = 0;
}

function distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ============== SHIP ==============
function createShip(id, x, y, color, name) {
    return {
        id: id,
        x: x || CONFIG.width / 2,
        y: y || CONFIG.height / 2,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,
        color: color || randomColor(),
        thrusting: false,
        name: name || 'Unknown',
        stats: createSessionStats(),
        state: PlayerState.FLYING,
        upgrades: [],           // Array of upgrade IDs
        nearRock: null,         // Rock we're close to (can mine)
        miningRockId: null      // Rock we're currently mining
    };
}

function updateShip(ship, input) {
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

function drawShip(ship) {
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

// ============== ROCKS ==============
function createRock(x, y, size) {
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
        x: x !== undefined ? x : Math.random() * CONFIG.width,
        y: y !== undefined ? y : Math.random() * CONFIG.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: radius,
        sizeIndex: sizeIndex,
        vertices: vertices,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.02
    };
}

function updateRock(rock) {
    rock.x += rock.vx;
    rock.y += rock.vy;
    rock.rotation += rock.rotSpeed;
    wrapPosition(rock);
}

function drawRock(rock) {
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

function spawnInitialRocks() {
    rocks = [];
    for (let i = 0; i < CONFIG.initialRocks; i++) {
        // Spawn away from center
        let x, y;
        do {
            x = Math.random() * CONFIG.width;
            y = Math.random() * CONFIG.height;
        } while (distance({ x, y }, { x: CONFIG.width / 2, y: CONFIG.height / 2 }) < 150);

        rocks.push(createRock(x, y, 0));
    }
}

// ============== BULLETS ==============
function createBullet(ship) {
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

function updateBullet(bullet) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.life--;

    // Bullets don't wrap - remove when off-screen
    if (bullet.x < 0 || bullet.x > CONFIG.width ||
        bullet.y < 0 || bullet.y > CONFIG.height) {
        bullet.life = 0;
    }
}

function drawBullet(bullet) {
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius || 3, 0, Math.PI * 2);
    ctx.fill();
}

// ============== HOMING MISSILES ==============
function createMissile(ship) {
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

function updateMissile(missile) {
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
        particles.push({
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

function drawMissile(missile) {
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

// ============== PROXIMITY MINES ==============
function createMine(ship) {
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

function updateMine(mine) {
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

function drawMine(mine) {
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

function checkMineCollisions() {
    if (!isHost) return;

    for (let i = mines.length - 1; i >= 0; i--) {
        const mine = mines[i];
        if (!mine.armed) continue;

        // Check against rocks
        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            const dist = distance(mine, rock);

            if (dist < mine.triggerRadius + rock.radius) {
                // BOOM!
                explodeMine(mine, i);
                break;
            }
        }
    }
}

function explodeMine(mine, index) {
    const x = mine.x;
    const y = mine.y;

    // Remove mine
    mines.splice(index, 1);

    // Play explosion sound
    playExplosion(0);

    // Damage nearby rocks
    for (let i = rocks.length - 1; i >= 0; i--) {
        const rock = rocks[i];
        if (distance({ x, y }, rock) < 80) {
            broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                playerId: mine.ownerId,
                rockId: rock.id,
                rockSize: rock.sizeIndex
            }));

            // Spawn explosion particles
            const particleCount = (3 - rock.sizeIndex) * 8 + 5;
            for (let p = 0; p < particleCount; p++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 2 + Math.random() * 3;
                particles.push({
                    x: rock.x,
                    y: rock.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: Math.random() > 0.5 ? '#f4f' : '#888',
                    life: 25 + Math.random() * 25,
                    maxLife: 50,
                    size: 1 + Math.random() * 2,
                    glow: Math.random() > 0.6
                });
            }

            // Split rock if not smallest
            if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                for (let k = 0; k < 2; k++) {
                    rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                }
            }

            rocks.splice(i, 1);
        }
    }

    // Big explosion particles
    for (let p = 0; p < 30; p++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        particles.push({
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: Math.random() > 0.7 ? '#fff' : (Math.random() > 0.5 ? '#f4f' : '#a4a'),
            life: 20 + Math.random() * 30,
            maxLife: 50,
            size: 2 + Math.random() * 3,
            glow: true
        });
    }
}

// ============== LUNAR LANDER MINI-GAME ==============
let landerState = null;  // Active lander game state

function createLanderState(rockId) {
    // Generate terrain
    const terrain = generateTerrain();

    return {
        rockId: rockId,
        x: CONFIG.width / 2,
        y: 80,
        vx: 0,
        vy: 0,
        angle: -Math.PI / 2,  // Pointing up
        fuel: LANDER_CONFIG.maxFuel,
        terrain: terrain.points,
        landingPads: terrain.pads,
        status: 'active',     // 'active', 'landed', 'crashed'
        reward: null,
        thrustOn: false
    };
}

function generateTerrain() {
    const points = [];
    const pads = [];
    const segmentWidth = CONFIG.width / LANDER_CONFIG.terrainSegments;
    let y = CONFIG.height - 100;

    // Decide which segments have landing pads
    const padSegments = [];
    while (padSegments.length < LANDER_CONFIG.landingPadCount) {
        const seg = 3 + Math.floor(Math.random() * (LANDER_CONFIG.terrainSegments - 6));
        if (!padSegments.includes(seg) && !padSegments.includes(seg - 1) && !padSegments.includes(seg + 1)) {
            padSegments.push(seg);
        }
    }

    for (let i = 0; i <= LANDER_CONFIG.terrainSegments; i++) {
        const x = i * segmentWidth;

        if (padSegments.includes(i)) {
            // Landing pad - flat section
            const padY = y;
            points.push({ x, y: padY });
            points.push({ x: x + segmentWidth, y: padY });
            pads.push({ x, y: padY, width: segmentWidth });
            i++; // Skip next segment (pad takes 2)
        } else {
            // Jagged terrain
            y += (Math.random() - 0.4) * 40;
            y = Math.max(CONFIG.height - 200, Math.min(CONFIG.height - 50, y));
            points.push({ x, y });
        }
    }

    return { points, pads };
}

function updateLander() {
    if (!landerState || landerState.status !== 'active') return;

    const L = landerState;

    // Gravity
    L.vy += LANDER_CONFIG.gravity;

    // Rotation
    if (keys.left) L.angle -= LANDER_CONFIG.rotSpeed;
    if (keys.right) L.angle += LANDER_CONFIG.rotSpeed;

    // Thrust
    const wasThrusting = L.thrustOn;
    L.thrustOn = keys.up && L.fuel > 0;
    if (L.thrustOn) {
        L.vx += Math.cos(L.angle) * LANDER_CONFIG.thrust;
        L.vy += Math.sin(L.angle) * LANDER_CONFIG.thrust;
        L.fuel -= LANDER_CONFIG.fuelUsage;
        if (!wasThrusting) startThrust();
    } else if (wasThrusting) {
        stopThrust();
    }

    // Move
    L.x += L.vx;
    L.y += L.vy;

    // Screen bounds (wrap horizontally)
    if (L.x < 0) L.x = CONFIG.width;
    if (L.x > CONFIG.width) L.x = 0;

    // Check terrain collision
    const terrainY = getTerrainHeight(L.x, L.terrain);
    if (L.y >= terrainY - 10) {
        const speed = Math.sqrt(L.vx * L.vx + L.vy * L.vy);
        const angleFromVertical = Math.abs(L.angle + Math.PI / 2);
        const onPad = isOnLandingPad(L.x, L.landingPads);

        stopThrust(); // Stop any thrust sound
        if (onPad && speed < LANDER_CONFIG.maxLandingSpeed && angleFromVertical < LANDER_CONFIG.maxLandingAngle) {
            // SUCCESS!
            L.status = 'landed';
            L.reward = getRandomUpgrade();
            L.y = terrainY - 10;
            L.vx = 0;
            L.vy = 0;
            playSuccess();
        } else {
            // CRASH!
            L.status = 'crashed';
            playCrash();
        }
    }

    // Out of bounds top - just cap it
    if (L.y < 20) {
        L.y = 20;
        L.vy = Math.max(0, L.vy);
    }
}

function getTerrainHeight(x, terrain) {
    // Find the two terrain points we're between
    for (let i = 0; i < terrain.length - 1; i++) {
        if (x >= terrain[i].x && x <= terrain[i + 1].x) {
            // Linear interpolation
            const t = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
            return terrain[i].y + t * (terrain[i + 1].y - terrain[i].y);
        }
    }
    return CONFIG.height - 50;
}

function isOnLandingPad(x, pads) {
    for (const pad of pads) {
        if (x >= pad.x && x <= pad.x + pad.width) {
            return true;
        }
    }
    return false;
}

function renderLander() {
    if (!landerState) return;

    const L = landerState;

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Stars
    ctx.fillStyle = '#333';
    for (let i = 0; i < 80; i++) {
        const sx = (i * 137 + 50) % CONFIG.width;
        const sy = (i * 251 + 30) % (CONFIG.height - 200);
        ctx.fillRect(sx, sy, 1, 1);
    }

    // Terrain
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.height);
    L.terrain.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(CONFIG.width, CONFIG.height);
    ctx.closePath();
    ctx.fill();

    // Landing pads (highlighted)
    ctx.fillStyle = '#4f4';
    ctx.shadowColor = '#4f4';
    ctx.shadowBlur = 10;
    L.landingPads.forEach(pad => {
        ctx.fillRect(pad.x, pad.y - 4, pad.width, 4);
    });
    ctx.shadowBlur = 0;

    // Lander ship
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.angle);

    // Ship body
    ctx.strokeStyle = L.status === 'crashed' ? '#f44' : '#4af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(-8, -8);
    ctx.lineTo(-12, -15);
    ctx.moveTo(-8, 8);
    ctx.lineTo(-12, 15);
    ctx.stroke();

    // Thrust flame
    if (L.thrustOn && L.status === 'active') {
        ctx.strokeStyle = '#f80';
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(-20 - Math.random() * 10, 0);
        ctx.lineTo(-5, 5);
        ctx.stroke();
    }

    ctx.restore();

    // HUD
    ctx.fillStyle = '#fff';
    ctx.font = '16px "Courier New", monospace';

    // Fuel bar
    ctx.fillText('FUEL', 20, 30);
    ctx.strokeStyle = '#4af';
    ctx.strokeRect(70, 15, 100, 20);
    ctx.fillStyle = L.fuel > 20 ? '#4af' : '#f44';
    ctx.fillRect(72, 17, (L.fuel / LANDER_CONFIG.maxFuel) * 96, 16);

    // Velocity
    const speed = Math.sqrt(L.vx * L.vx + L.vy * L.vy);
    ctx.fillStyle = speed < LANDER_CONFIG.maxLandingSpeed ? '#4f4' : '#f44';
    ctx.fillText(`VEL: ${speed.toFixed(1)}`, 200, 30);

    // Altitude
    const alt = Math.max(0, getTerrainHeight(L.x, L.terrain) - L.y - 10);
    ctx.fillStyle = '#fff';
    ctx.fillText(`ALT: ${Math.floor(alt)}`, 320, 30);

    // Angle indicator
    const angleDeg = ((L.angle + Math.PI / 2) * 180 / Math.PI).toFixed(0);
    const angleOk = Math.abs(L.angle + Math.PI / 2) < LANDER_CONFIG.maxLandingAngle;
    ctx.fillStyle = angleOk ? '#4f4' : '#f44';
    ctx.fillText(`ANG: ${angleDeg}°`, 440, 30);

    // Status messages
    if (L.status === 'landed') {
        ctx.fillStyle = '#4f4';
        ctx.font = '32px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LANDED!', CONFIG.width / 2, CONFIG.height / 2 - 40);
        ctx.font = '20px "Courier New", monospace';
        ctx.fillStyle = L.reward.color;
        ctx.fillText(`+ ${L.reward.name}`, CONFIG.width / 2, CONFIG.height / 2);
        ctx.fillStyle = '#888';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press SPACE to continue', CONFIG.width / 2, CONFIG.height / 2 + 40);
        ctx.textAlign = 'left';
    } else if (L.status === 'crashed') {
        ctx.fillStyle = '#f44';
        ctx.font = '32px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED!', CONFIG.width / 2, CONFIG.height / 2 - 20);
        ctx.fillStyle = '#888';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillText('Press SPACE to continue', CONFIG.width / 2, CONFIG.height / 2 + 20);
        ctx.textAlign = 'left';
    } else {
        // Instructions
        ctx.fillStyle = '#666';
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Land gently on green pads | ← → rotate | ↑ thrust', CONFIG.width / 2, CONFIG.height - 20);
        ctx.textAlign = 'left';
    }
}

function enterMiningMode(rockId) {
    const myShip = ships[myId];
    // Guard: don't re-enter if already in mining mode OR if landerState exists
    // (landerState check handles race condition where host resets state to FLYING)
    if (!myShip || myShip.state === PlayerState.MINING || landerState) return;

    myShip.state = PlayerState.MINING;
    myShip.miningRockId = rockId;

    // Create lunar lander state
    landerState = createLanderState(rockId);

    // Broadcast state change
    if (isHost) {
        broadcastEvent(createEvent(GameEvents.PLAYER_MINING, { playerId: myId, rockId }));
    } else if (hostConnection && hostConnection.open) {
        hostConnection.send({ type: 'enter_mining', rockId });
    }

    console.log('Entered mining mode for rock:', rockId);
}

function exitMiningMode(success, upgrade) {
    const myShip = ships[myId];
    if (!myShip) return;

    myShip.state = PlayerState.FLYING;

    if (success && upgrade) {
        // Add upgrade if we don't already have it
        if (!myShip.upgrades.includes(upgrade.id)) {
            myShip.upgrades.push(upgrade.id);
            console.log('Got upgrade:', upgrade.name);
        }
    }

    myShip.miningRockId = null;
    landerState = null;

    // Broadcast state change
    if (isHost) {
        broadcastEvent(createEvent(GameEvents.PLAYER_LEFT, {
            playerId: myId,
            upgrade: success ? upgrade?.id : null
        }));
    } else if (hostConnection && hostConnection.open) {
        hostConnection.send({
            type: 'exit_mining',
            success,
            upgrade: success ? upgrade?.id : null
        });
    }
}

function checkNearbyRocks(ship) {
    if (!ship || ship.state !== PlayerState.FLYING) {
        ship.nearRock = null;
        ship.miningCountdown = 0;
        ship.miningReady = false;
        return;
    }

    // Only large rocks can be mined
    let nearest = null;
    let nearestDist = CONFIG.miningDistance;

    for (const rock of rocks) {
        if (rock.sizeIndex === 0) {  // Only large rocks
            const d = distance(ship, rock);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = rock;
            }
        }
    }

    // Check if we're near the same rock and matching velocity
    if (nearest) {
        const velDiffX = Math.abs(ship.vx - nearest.vx);
        const velDiffY = Math.abs(ship.vy - nearest.vy);
        const velocityMatched = velDiffX < 1.5 && velDiffY < 1.5;

        // Compare by ID, not reference (references change when state is synced from host)
        const sameRock = ship.nearRock && ship.nearRock.id === nearest.id;

        if (sameRock && velocityMatched) {
            // Continue countdown
            ship.miningCountdown = (ship.miningCountdown || 0) + 1;
            // 2 seconds at 60fps = 120 frames
            if (ship.miningCountdown >= 120 && !ship.miningReady) {
                ship.miningReady = true;
                // Play chime when ready (only for local player)
                if (ship.id === myId) {
                    playChime();
                }
            }
        } else {
            // Different rock or velocity not matched - reset
            ship.miningCountdown = 0;
            ship.miningReady = false;
        }
    } else {
        // Not near any rock - reset
        ship.miningCountdown = 0;
        ship.miningReady = false;
    }

    ship.nearRock = nearest;
}

// ============== BOT AI ==============
function getBotInput(ship) {
    if (!ship || rocks.length === 0) {
        return { left: false, right: false, up: false, space: false };
    }

    // Find nearest rock
    let nearestRock = null;
    let nearestDist = Infinity;
    for (const rock of rocks) {
        const d = distance(ship, rock);
        if (d < nearestDist) {
            nearestDist = d;
            nearestRock = rock;
        }
    }

    if (!nearestRock) {
        return { left: false, right: false, up: false, space: false };
    }

    // Calculate angle to rock
    const targetAngle = Math.atan2(
        nearestRock.y - ship.y,
        nearestRock.x - ship.x
    );

    // Normalize angles
    let angleDiff = targetAngle - ship.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Bot inputs
    const input = {
        left: angleDiff < -0.1,
        right: angleDiff > 0.1,
        up: nearestDist > 150 && Math.abs(angleDiff) < 0.5, // Thrust toward if far and aimed
        space: Math.abs(angleDiff) < 0.2 && nearestDist < 400 // Shoot if aimed at rock
    };

    return input;
}

// ============== COLLISION ==============
function checkCollisions() {
    if (!isHost) return;

    // Bullets vs Rocks
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        const bulletRadius = bullet.radius || 3;

        for (let j = rocks.length - 1; j >= 0; j--) {
            const rock = rocks[j];
            if (distance(bullet, rock) < rock.radius + bulletRadius) {
                // Emit rock destroyed event
                broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                    playerId: bullet.ownerId,
                    rockId: rock.id,
                    rockSize: rock.sizeIndex
                }));

                // Check for explosive rounds
                const shooter = ships[bullet.ownerId];
                const isExplosive = shooter?.upgrades?.includes('explosives');

                // Remove bullet
                bullets.splice(i, 1);

                // Split or destroy rock
                if (rock.sizeIndex < CONFIG.rockSizes.length - 1) {
                    // Split into smaller rocks (unless explosive - then destroy completely)
                    if (!isExplosive) {
                        for (let k = 0; k < 2; k++) {
                            rocks.push(createRock(rock.x, rock.y, rock.sizeIndex + 1));
                        }
                    }
                }

                const rockX = rock.x;
                const rockY = rock.y;
                const rockSize = rock.sizeIndex;
                rocks.splice(j, 1);

                // Play explosion sound (size affects pitch/duration)
                playExplosion(rockSize);

                // Spawn explosion particles
                const particleCount = (3 - rockSize) * 12 + 8; // More particles for bigger rocks
                for (let p = 0; p < particleCount; p++) {
                    const angle = (p / particleCount) * Math.PI * 2 + Math.random() * 0.5;
                    const speed = (2 + (2 - rockSize)) * (0.3 + Math.random() * 0.7);
                    const isGlowing = Math.random() > 0.7;

                    particles.push({
                        x: rockX + (Math.random() - 0.5) * 15,
                        y: rockY + (Math.random() - 0.5) * 15,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: isGlowing ? '#fa8' : (Math.random() > 0.5 ? '#888' : '#666'),
                        life: 25 + Math.random() * 35,
                        maxLife: 60,
                        size: 1 + Math.random() * (3 - rockSize),
                        glow: isGlowing
                    });
                }

                // Central flash
                particles.push({
                    x: rockX,
                    y: rockY,
                    vx: 0,
                    vy: 0,
                    color: '#fff',
                    life: 8,
                    maxLife: 8,
                    size: 10 + (2 - rockSize) * 5,
                    glow: true
                });

                // Explosive chain reaction - damage nearby rocks
                if (isExplosive) {
                    for (let k = rocks.length - 1; k >= 0; k--) {
                        if (distance({ x: rockX, y: rockY }, rocks[k]) < 80) {
                            broadcastEvent(createEvent(GameEvents.ROCK_DESTROYED, {
                                playerId: bullet.ownerId,
                                rockId: rocks[k].id,
                                rockSize: rocks[k].sizeIndex
                            }));
                            rocks.splice(k, 1);
                        }
                    }
                }

                // Respawn rocks if all destroyed
                if (rocks.length === 0) {
                    setTimeout(() => {
                        if (isHost && gameRunning) {
                            spawnInitialRocks();
                            broadcastState();
                        }
                    }, 2000);
                }

                break;
            }
        }
    }

    // Rock vs Rock collisions
    checkRockCollisions();
}

function checkRockCollisions() {
    const energyLoss = 0.95; // 5% energy lost to "heat"

    for (let i = 0; i < rocks.length; i++) {
        for (let j = i + 1; j < rocks.length; j++) {
            const r1 = rocks[i];
            const r2 = rocks[j];

            const dist = distance(r1, r2);
            const minDist = r1.radius + r2.radius;

            if (dist < minDist && dist > 0) {
                // Collision detected!
                // Calculate collision normal
                const nx = (r2.x - r1.x) / dist;
                const ny = (r2.y - r1.y) / dist;

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

                    // Spawn impact particles at collision point
                    const impactX = r1.x + nx * r1.radius;
                    const impactY = r1.y + ny * r1.radius;
                    const impactSpeed = Math.abs(dvn);

                    spawnRockCollisionParticles(impactX, impactY, impactSpeed, nx, ny);

                    // Flash glow on rocks
                    r1.glowColor = '#864';
                    r2.glowColor = '#864';
                    setTimeout(() => {
                        if (r1) r1.glowColor = null;
                        if (r2) r2.glowColor = null;
                    }, 100);

                    // Play subtle collision sound based on impact speed
                    if (impactSpeed > 0.5) {
                        playRockCollision(impactSpeed);
                    }
                }
            }
        }
    }
}

// Rock collision particles - sparks and debris
function spawnRockCollisionParticles(x, y, speed, nx, ny) {
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

// Subtle rock collision sound
function playRockCollision(speed) {
    ensureAudio();
    const t = audioCtx.currentTime;

    // Low thud based on impact speed
    const thud = audioCtx.createOscillator();
    const thudGain = audioCtx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(50 + speed * 20, t);
    thud.frequency.exponentialRampToValueAtTime(25, t + 0.08);
    thudGain.gain.setValueAtTime(Math.min(0.2, speed * 0.1), t);
    thudGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
    thud.connect(thudGain);
    thudGain.connect(masterGain);
    thud.start(t);
    thud.stop(t + 0.08);

    // Gritty texture
    const noiseSize = Math.floor(audioCtx.sampleRate * 0.04);
    const buffer = audioCtx.createBuffer(1, noiseSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseSize, 2);
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 300;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = Math.min(0.15, speed * 0.08);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start(t);
}

// ============== NETWORKING ==============
function setupHost() {
    const roomCode = generateRoomCode();
    currentRoomCode = roomCode;  // Store for sharing
    document.getElementById('room-code').textContent = roomCode;

    peer = new Peer(roomCode, {
        debug: 1
    });

    peer.on('open', (id) => {
        console.log('Host peer opened with ID:', id);
        myId = id;
        isHost = true;
        document.getElementById('status').textContent = 'Room ready! Tap INVITE to share.';
    });

    peer.on('connection', (conn) => {
        console.log('Client connected:', conn.peer);
        connections.push(conn);

        conn.on('open', () => {
            console.log('Client connection opened, waiting for join message...');
        });

        conn.on('data', (data) => {
            handleClientMessage(conn.peer, data);
        });

        conn.on('close', () => {
            console.log('Client disconnected:', conn.peer);
            connections = connections.filter(c => c !== conn);
            delete ships[conn.peer];
            updatePlayerCount();
            broadcastState();
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        document.getElementById('status').textContent = 'Error: ' + err.type;
    });
}

function setupClient(roomCode) {
    document.getElementById('join-status').textContent = 'Connecting...';

    peer = new Peer({
        debug: 1
    });

    peer.on('open', (id) => {
        console.log('Client peer opened with ID:', id);
        myId = id;

        hostConnection = peer.connect(roomCode, {
            reliable: true
        });

        hostConnection.on('open', () => {
            console.log('Connected to host');
            document.getElementById('join-status').textContent = 'Connected! Waiting for game...';

            // Send our info to host
            hostConnection.send({
                type: 'join',
                name: myName,
                userId: myUserId
            });
        });

        hostConnection.on('data', (data) => {
            handleHostMessage(data);
        });

        hostConnection.on('close', () => {
            console.log('Disconnected from host');
            document.getElementById('join-status').textContent = 'Disconnected from host';
            gameRunning = false;
        });

        hostConnection.on('error', (err) => {
            console.error('Connection error:', err);
            document.getElementById('join-status').textContent = 'Connection error';
        });
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            document.getElementById('join-status').textContent = 'Room not found!';
        } else {
            document.getElementById('join-status').textContent = 'Error: ' + err.type;
        }
    });
}

function handleClientMessage(clientId, data) {
    if (data.type === 'join') {
        // Create ship for new player with their name
        const colors = ['#4af', '#f4a', '#4fa', '#fa4', '#a4f', '#af4'];
        const color = colors[Object.keys(ships).length % colors.length];
        ships[clientId] = createShip(clientId, null, null, color, data.name);

        // Send current state to new player
        const conn = connections.find(c => c.peer === clientId);
        if (conn && conn.open) {
            conn.send({
                type: 'init',
                playerId: clientId,
                ships: ships,
                rocks: rocks,
                bullets: bullets,
                gameRunning: gameRunning
            });
        }

        updatePlayerCount();
        broadcastState();
    } else if (data.type === 'input') {
        // Apply client input to their ship
        if (ships[clientId]) {
            if (data.shooting && Date.now() - (ships[clientId].lastShot || 0) > 200) {
                bullets.push(createBullet(ships[clientId]));
                ships[clientId].lastShot = Date.now();
                broadcastEvent(createEvent(GameEvents.SHOT_FIRED, { playerId: clientId }));
            }

            // Track thrust start/stop
            if (data.up && !thrustStartTime[clientId]) {
                thrustStartTime[clientId] = Date.now();
                broadcastEvent(createEvent(GameEvents.THRUST_START, { playerId: clientId }));
            } else if (!data.up && thrustStartTime[clientId]) {
                const duration = (Date.now() - thrustStartTime[clientId]) / 1000;
                if (ships[clientId]?.stats) {
                    ships[clientId].stats.fuelUsed += duration * CONFIG.fuelPerThrust * 60;
                }
                delete thrustStartTime[clientId];
                broadcastEvent(createEvent(GameEvents.THRUST_STOP, { playerId: clientId }));
            }
            // Store input for physics update
            ships[clientId].input = data;
        }
    } else if (data.type === 'enter_mining') {
        // Client wants to enter mining mode
        if (ships[clientId] && ships[clientId].state !== PlayerState.MINING) {
            ships[clientId].state = PlayerState.MINING;
            ships[clientId].miningRockId = data.rockId;
            broadcastEvent(createEvent(GameEvents.PLAYER_MINING, { playerId: clientId, rockId: data.rockId }));
            console.log('Client', clientId, 'entered mining mode for rock:', data.rockId);
        }
    } else if (data.type === 'exit_mining') {
        // Client exited mining mode
        if (ships[clientId]) {
            ships[clientId].state = PlayerState.FLYING;
            ships[clientId].miningRockId = null;
            if (data.success && data.upgrade) {
                if (!ships[clientId].upgrades.includes(data.upgrade)) {
                    ships[clientId].upgrades.push(data.upgrade);
                }
            }
            broadcastEvent(createEvent(GameEvents.PLAYER_LEFT, {
                playerId: clientId,
                upgrade: data.success ? data.upgrade : null
            }));
            console.log('Client', clientId, 'exited mining mode, success:', data.success);
        }
    }
}

function handleHostMessage(data) {
    if (data.type === 'init') {
        myId = data.playerId;
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;
        // Initialize interpolation state
        interpolation.previousState = null;
        interpolation.targetState = { ships: deepCopy(ships), rocks: deepCopy(rocks), bullets: deepCopy(bullets) };
        interpolation.lastUpdateTime = performance.now();
        if (data.gameRunning) {
            startGame();
        }
    } else if (data.type === 'state') {
        // Buffer states for interpolation (clients only)
        if (!isHost && interpolation.enabled) {
            // Move current target to previous
            interpolation.previousState = interpolation.targetState;
            // Store new target
            interpolation.targetState = {
                ships: deepCopy(data.ships),
                rocks: deepCopy(data.rocks),
                bullets: deepCopy(data.bullets)
            };
            interpolation.lastUpdateTime = performance.now();
        }

        // Preserve local mining-related state (these properties are client-side only)
        const myShipLocal = ships[myId];
        const localMiningState = myShipLocal ? {
            nearRock: myShipLocal.nearRock,
            miningCountdown: myShipLocal.miningCountdown,
            miningReady: myShipLocal.miningReady,
            // Also preserve if actively in mini-game
            inMining: myShipLocal.state === PlayerState.MINING && landerState,
            miningRockId: myShipLocal.miningRockId
        } : null;

        // Update authoritative game state
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;

        // Restore local mining state for our ship
        if (localMiningState && ships[myId]) {
            ships[myId].nearRock = localMiningState.nearRock;
            ships[myId].miningCountdown = localMiningState.miningCountdown;
            ships[myId].miningReady = localMiningState.miningReady;
            if (localMiningState.inMining) {
                ships[myId].state = PlayerState.MINING;
                ships[myId].miningRockId = localMiningState.miningRockId;
            }
        }

        updateHUD();
    } else if (data.type === 'start') {
        ships = data.ships;
        rocks = data.rocks;
        bullets = data.bullets;
        // Initialize interpolation state
        interpolation.previousState = null;
        interpolation.targetState = { ships: deepCopy(ships), rocks: deepCopy(rocks), bullets: deepCopy(bullets) };
        interpolation.lastUpdateTime = performance.now();
        startGame();
    } else if (data.type === 'event') {
        // Handle game events from host
        handleGameEvent(data.event);
    }
}

// Deep copy helper for state buffering
function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => deepCopy(item));
    const copy = {};
    for (const key in obj) {
        copy[key] = deepCopy(obj[key]);
    }
    return copy;
}

function broadcastState() {
    const state = {
        type: 'state',
        ships: ships,
        rocks: rocks,
        bullets: bullets
    };

    connections.forEach(conn => {
        if (conn.open) {
            conn.send(state);
        }
    });
}

function sendInputToHost() {
    if (hostConnection && hostConnection.open) {
        hostConnection.send({
            type: 'input',
            left: keys.left,
            right: keys.right,
            up: keys.up,
            shooting: keys.space && Date.now() - lastShot > 200
        });

        if (keys.space && Date.now() - lastShot > 200) {
            lastShot = Date.now();
        }
    }
}

function updatePlayerCount() {
    const count = Object.keys(ships).length;
    document.getElementById('player-list').textContent = `Players: ${count}`;
    document.getElementById('hud-players').textContent = count;
}

// ============== CANVAS & FULLSCREEN ==============
function resizeCanvas() {
    const wrapper = document.getElementById('game-wrapper');
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Calculate canvas size maintaining aspect ratio
    const gameRatio = CONFIG.width / CONFIG.height;
    const screenRatio = screenWidth / screenHeight;

    if (screenRatio > gameRatio) {
        // Screen is wider than game - fit to height
        canvas.height = CONFIG.height;
        canvas.width = CONFIG.width;
    } else {
        // Screen is taller than game - fit to width
        canvas.height = CONFIG.height;
        canvas.width = CONFIG.width;
    }

    // The CSS handles the visual scaling, canvas stays at logical resolution
    canvas.width = CONFIG.width;
    canvas.height = CONFIG.height;
}

function toggleFullscreen() {
    const elem = document.documentElement;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Enter fullscreen
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        }

        // Lock to landscape on mobile if supported
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
}

function setupFullscreen() {
    const btn = document.getElementById('fullscreen-btn');
    btn.addEventListener('click', toggleFullscreen);

    // Update button icon based on fullscreen state
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

    // Resize canvas when orientation/screen changes
    window.addEventListener('resize', () => {
        if (gameRunning) resizeCanvas();
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            if (gameRunning) resizeCanvas();
        }, 100);
    });
}

function updateFullscreenButton() {
    const btn = document.getElementById('fullscreen-btn');
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        btn.textContent = '⛶';
        btn.title = 'Exit Fullscreen';
    } else {
        btn.textContent = '⛶';
        btn.title = 'Fullscreen';
    }
}

// ============== GAME LOOP ==============
function startGame() {
    gameRunning = true;

    // Initialize starfield
    initStarfield();

    // Increment games played
    if (myLifetimeStats) {
        myLifetimeStats.gamesPlayed++;
        saveLifetimeStats(myLifetimeStats);
    }

    // Hide menu, show game
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('game-wrapper').style.display = 'block';
    document.getElementById('hud').style.display = 'block';
    document.getElementById('controls-help').classList.remove('hidden');
    document.getElementById('touch-controls').classList.remove('hidden');
    document.getElementById('fullscreen-btn').style.display = 'block';

    // Show in-game invite button for host
    if (isHost && currentRoomCode) {
        document.getElementById('ingame-invite-btn').style.display = 'block';
    }

    // Size canvas to fill screen while maintaining aspect ratio
    resizeCanvas();

    if (isHost) {
        // Create host ship if not exists
        if (!ships[myId]) {
            ships[myId] = createShip(myId, null, null, '#4af', myName);
        }

        // Spawn rocks
        spawnInitialRocks();

        // Notify clients
        connections.forEach(conn => {
            if (conn.open) {
                conn.send({
                    type: 'start',
                    ships: ships,
                    rocks: rocks,
                    bullets: bullets
                });
            }
        });

        // Start network broadcast loop
        setInterval(() => {
            if (gameRunning) {
                broadcastState();
            }
        }, CONFIG.networkTickRate);
    }

    // Start game loop
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (!gameRunning) return;

    update();
    render();

    requestAnimationFrame(gameLoop);
}

function update() {
    const myShip = ships[myId];

    // Check if we're in mining mode (lunar lander)
    if (myShip && myShip.state === PlayerState.MINING) {
        updateLander();
        return;
    }

    if (isHost) {
        // Host updates all game state
        // Update host's own ship (or bot)
        if (myShip && myShip.state === PlayerState.FLYING) {
            const input = isBot ? getBotInput(myShip) : keys;

            // Check for mining trigger
            checkNearbyRocks(myShip);
            if (keys.mine && myShip.nearRock && myShip.miningReady) {
                enterMiningMode(myShip.nearRock.id);
                return;
            }

            // Shooting with upgrades
            const fireRate = hasUpgrade(myShip, 'rapid_fire') ? 100 : 200;
            if (input.space && Date.now() - lastShot > fireRate) {
                fireBullets(myShip);
                lastShot = Date.now();
            }

            // Alt-fire for secondary weapons
            if (keys.altFire && Date.now() - lastAltFire > 300) {
                fireSecondary(myShip);
                lastAltFire = Date.now();
            }

            // Track host's thrust
            if (input.up && !thrustStartTime[myId]) {
                thrustStartTime[myId] = Date.now();
                startThrust();
            } else if (!input.up && thrustStartTime[myId]) {
                stopThrust();
                const duration = (Date.now() - thrustStartTime[myId]) / 1000;
                if (myShip.stats) {
                    myShip.stats.fuelUsed += duration * CONFIG.fuelPerThrust * 60;
                }
                delete thrustStartTime[myId];
            }

            // Spawn thrust particles
            if (input.up) {
                spawnThrustParticle(myShip);
            }

            updateShip(myShip, input);
        }

        // Update client ships based on their inputs
        Object.values(ships).forEach(ship => {
            if (ship.id !== myId && ship.input && ship.state === PlayerState.FLYING) {
                updateShip(ship, ship.input);
            }
        });

        // Update rocks
        rocks.forEach(updateRock);

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            updateBullet(bullets[i]);
            if (bullets[i].life <= 0) {
                bullets.splice(i, 1);
            }
        }

        // Check collisions
        checkCollisions();

        // Update particles
        updateParticles();

        // Update starfield
        updateStarfield();
    } else {
        // Client: check for mining
        if (myShip && myShip.state === PlayerState.FLYING) {
            checkNearbyRocks(myShip);
            if (keys.mine && myShip.nearRock && myShip.miningReady) {
                enterMiningMode(myShip.nearRock.id);
                return;
            }
        }

        // Client sends input to host
        sendInputToHost();

        // Client-side thrust particles
        if (keys.up && myShip) {
            spawnThrustParticle(myShip);
        }

        // Update particles on client too
        updateParticles();

        // Update starfield on client too
        updateStarfield();
    }

    updateHUD();
}

// Fire bullets with upgrade support
function fireBullets(ship) {
    // Only play sound for local player
    if (ship.id === myId) {
        playShoot();
    }

    let usedSpread = false;
    let usedBig = false;
    let usedExplosive = false;

    if (hasUpgrade(ship, 'spread_shot')) {
        // Fire 3 bullets in a cone
        for (let i = -1; i <= 1; i++) {
            const spreadAngle = ship.angle + i * 0.2;
            const bullet = createBullet(ship);
            bullet.vx = Math.cos(spreadAngle) * CONFIG.bulletSpeed + ship.vx;
            bullet.vy = Math.sin(spreadAngle) * CONFIG.bulletSpeed + ship.vy;
            if (hasUpgrade(ship, 'big_bullets')) {
                bullet.radius = 5;
                usedBig = true;
            }
            if (hasUpgrade(ship, 'explosives')) {
                bullet.explosive = true;
                usedExplosive = true;
            }
            bullets.push(bullet);
        }
        usedSpread = true;
    } else {
        const bullet = createBullet(ship);
        if (hasUpgrade(ship, 'big_bullets')) {
            bullet.radius = 5;
            usedBig = true;
        }
        if (hasUpgrade(ship, 'explosives')) {
            bullet.explosive = true;
            usedExplosive = true;
        }
        bullets.push(bullet);
    }

    // Use ammo for upgrades
    if (usedSpread) useUpgradeAmmo(ship, 'spread_shot');
    if (usedBig) useUpgradeAmmo(ship, 'big_bullets');
    if (usedExplosive) useUpgradeAmmo(ship, 'explosives');
    if (hasUpgrade(ship, 'rapid_fire')) useUpgradeAmmo(ship, 'rapid_fire');

    broadcastEvent(createEvent(GameEvents.SHOT_FIRED, { playerId: ship.id }));
}

// Fire secondary weapons (missiles, mines)
function fireSecondary(ship) {
    if (!ship) return;

    // Check for homing missiles
    if (hasUpgrade(ship, 'homing_missiles')) {
        missiles.push(createMissile(ship));
        useUpgradeAmmo(ship, 'homing_missiles');
        if (ship.id === myId) playShoot(); // TODO: missile sound
        return;
    }

    // Check for proximity mines
    if (hasUpgrade(ship, 'proximity_mines')) {
        mines.push(createMine(ship));
        useUpgradeAmmo(ship, 'proximity_mines');
        if (ship.id === myId) playClick(); // Deploy sound
        return;
    }
}

function render() {
    const myShip = ships[myId];

    // If in mining mode, render lunar lander instead
    if (myShip && myShip.state === PlayerState.MINING) {
        renderLander();
        return;
    }

    // Calculate interpolated state for smooth client rendering
    let renderShips = ships;
    let renderRocks = rocks;
    let renderBullets = bullets;

    if (!isHost && interpolation.enabled && interpolation.previousState && interpolation.targetState) {
        const now = performance.now();
        const elapsed = now - interpolation.lastUpdateTime;
        // Interpolate over the network tick interval, with some smoothing buffer
        const t = Math.min(1, elapsed / CONFIG.networkTickRate);

        // Interpolate ships
        renderShips = {};
        for (const id in interpolation.targetState.ships) {
            const prevShip = interpolation.previousState.ships ? interpolation.previousState.ships[id] : null;
            const targetShip = interpolation.targetState.ships[id];
            renderShips[id] = getInterpolatedEntity(prevShip, targetShip, t);
        }

        // Interpolate rocks (match by id)
        renderRocks = interpolation.targetState.rocks.map(targetRock => {
            const prevRock = interpolation.previousState.rocks ?
                interpolation.previousState.rocks.find(r => r.id === targetRock.id) : null;
            return getInterpolatedEntity(prevRock, targetRock, t);
        });

        // Interpolate bullets (match by id or index)
        renderBullets = interpolation.targetState.bullets.map((targetBullet, i) => {
            const prevBullet = interpolation.previousState.bullets ?
                interpolation.previousState.bullets.find(b => b.id === targetBullet.id) ||
                interpolation.previousState.bullets[i] : null;
            return getInterpolatedEntity(prevBullet, targetBullet, t);
        });
    }

    // Clear
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);

    // Draw starfield and nebulas
    renderStarfield();

    // Draw rocks (highlight mineable ones)
    renderRocks.forEach(rock => {
        drawRock(rock);
        // Highlight if we're near and can mine (compare by ID for interpolated rocks)
        if (myShip && myShip.nearRock && myShip.nearRock.id === rock.id) {
            const progress = (myShip.miningCountdown || 0) / 120; // 0 to 1
            const ready = myShip.miningReady;

            // Background circle (dashed, dim)
            ctx.strokeStyle = ready ? '#4f4' : '#444';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(rock.x, rock.y, rock.radius + 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Progress arc (solid, bright)
            if (progress > 0) {
                ctx.strokeStyle = ready ? '#4f4' : '#fa0';
                ctx.lineWidth = 3;
                ctx.beginPath();
                // Start from top (-PI/2), go clockwise
                ctx.arc(rock.x, rock.y, rock.radius + 10, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
                ctx.stroke();
            }

            // Glow effect when ready
            if (ready) {
                ctx.strokeStyle = '#4f4';
                ctx.lineWidth = 2;
                ctx.shadowColor = '#4f4';
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(rock.x, rock.y, rock.radius + 10, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
        }
    });

    // Draw bullets
    renderBullets.forEach(drawBullet);

    // Draw particles
    renderParticles();

    // Draw ships (skip those who are mining)
    Object.values(renderShips).forEach(ship => {
        if (ship.state !== PlayerState.MINING) {
            drawShip(ship);
        }
    });

    // Show mining prompt if near a rock
    if (myShip && myShip.nearRock) {
        ctx.font = '14px "Courier New", monospace';
        ctx.textAlign = 'center';

        if (myShip.miningReady) {
            ctx.fillStyle = '#4f4';
            ctx.fillText('Press E to mine', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
        } else {
            const progress = (myShip.miningCountdown || 0) / 120;
            if (progress > 0) {
                ctx.fillStyle = '#fa0';
                ctx.fillText('Matching velocity...', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
            } else {
                ctx.fillStyle = '#888';
                ctx.fillText('Match speed to dock', myShip.nearRock.x, myShip.nearRock.y - myShip.nearRock.radius - 25);
            }
        }
        ctx.textAlign = 'left';
    }

    // Show upgrades
    if (myShip && myShip.upgrades.length > 0) {
        ctx.fillStyle = '#888';
        ctx.font = '12px "Courier New", monospace';
        ctx.fillText('Upgrades:', CONFIG.width - 120, 20);
        myShip.upgrades.forEach((upId, i) => {
            const upgrade = Object.values(UPGRADES).find(u => u.id === upId);
            if (upgrade) {
                ctx.fillStyle = upgrade.color;
                ctx.fillText(upgrade.name, CONFIG.width - 120, 35 + i * 15);
            }
        });
    }

    // Show host info in bottom left
    if (currentRoomCode) {
        ctx.fillStyle = '#666';
        ctx.font = '12px "Courier New", monospace';
        const hostName = isHost ? myName : (Object.values(ships).find(s => s.id === currentRoomCode)?.name || 'Host');
        ctx.fillText(`Host: ${hostName}`, 10, CONFIG.height - 30);
        ctx.fillText(`Room: ${currentRoomCode}`, 10, CONFIG.height - 15);
    }
}

function updateHUD() {
    document.getElementById('hud-players').textContent = Object.keys(ships).length;
    document.getElementById('hud-rocks').textContent = rocks.length;

    // Update my stats display
    const myShip = ships[myId];
    if (myShip && myShip.stats) {
        document.getElementById('hud-hits').textContent = myShip.stats.rocksDestroyed;
        document.getElementById('hud-shots').textContent = myShip.stats.shotsFired;
        document.getElementById('hud-fuel').textContent = Math.floor(myShip.stats.fuelUsed);
    }
}

function updateMenuStats() {
    if (myLifetimeStats) {
        const rocksEl = document.getElementById('stat-rocks');
        const shotsEl = document.getElementById('stat-shots');
        const gamesEl = document.getElementById('stat-games');
        if (rocksEl) rocksEl.textContent = myLifetimeStats.rocksDestroyed || 0;
        if (shotsEl) shotsEl.textContent = myLifetimeStats.shotsFired || 0;
        if (gamesEl) gamesEl.textContent = myLifetimeStats.gamesPlayed || 0;
    }
}

// ============== INPUT HANDLING ==============
function setupInput() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = true;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = true;
        if (e.code === 'KeyE') keys.mine = true;
        if (e.code === 'KeyQ') keys.altFire = true;
        if (e.code === 'Space') {
            keys.space = true;
            e.preventDefault();

            // Handle lander exit
            if (landerState && landerState.status !== 'active') {
                const success = landerState.status === 'landed';
                exitMiningMode(success, landerState.reward);
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
        if (e.code === 'ArrowUp' || e.code === 'KeyW') keys.up = false;
        if (e.code === 'KeyE') keys.mine = false;
        if (e.code === 'KeyQ') keys.altFire = false;
        if (e.code === 'Space') keys.space = false;
    });

    // Touch controls
    setupTouchButton('left-btn', 'left');
    setupTouchButton('right-btn', 'right');
    setupTouchButton('thrust-btn', 'up');
    setupTouchButton('fire-btn', 'space');
    setupTouchButton('mine-btn', 'mine');
    setupTouchButton('alt-fire-btn', 'altFire');
}

function setupTouchButton(btnId, key) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    const activate = (e) => {
        e.preventDefault();
        keys[key] = true;
        btn.classList.add('active');
    };

    const deactivate = (e) => {
        e.preventDefault();
        keys[key] = false;
        btn.classList.remove('active');
    };

    btn.addEventListener('touchstart', activate, { passive: false });
    btn.addEventListener('touchend', deactivate, { passive: false });
    btn.addEventListener('touchcancel', deactivate, { passive: false });

    // Also support mouse for testing
    btn.addEventListener('mousedown', activate);
    btn.addEventListener('mouseup', deactivate);
    btn.addEventListener('mouseleave', deactivate);
}

// ============== MENU SETUP ==============
function setupMenu() {
    // Pre-fill name input with stored name
    const nameInput = document.getElementById('player-name');
    const storedName = getDisplayName();
    if (storedName) {
        nameInput.value = storedName;
    } else {
        nameInput.placeholder = generateNickname();
    }

    // Display lifetime stats
    updateMenuStats();

    // Save name on change (with debounce)
    let nameTimeout;
    nameInput.addEventListener('input', () => {
        clearTimeout(nameTimeout);
        nameTimeout = setTimeout(() => {
            const name = nameInput.value.trim();
            if (name) {
                setDisplayName(name);
                myName = name;
            }
        }, 500);
    });

    document.getElementById('host-btn').addEventListener('click', () => {
        playClick();
        // Save name before hosting
        const name = nameInput.value.trim() || nameInput.placeholder;
        setDisplayName(name);
        myName = name;

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('host-menu').classList.remove('hidden');
        setupHost();
    });

    document.getElementById('join-btn').addEventListener('click', () => {
        playClick();
        // Save name before joining
        const name = nameInput.value.trim() || nameInput.placeholder;
        setDisplayName(name);
        myName = name;

        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('join-menu').classList.remove('hidden');
    });

    document.getElementById('connect-btn').addEventListener('click', () => {
        playClick();
        const code = document.getElementById('room-input').value.toUpperCase().trim();
        if (code.length === 6) {
            setupClient(code);
        } else {
            document.getElementById('join-status').textContent = 'Please enter a 6-character code';
        }
    });

    document.getElementById('room-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('connect-btn').click();
        }
    });

    document.getElementById('start-game-btn').addEventListener('click', () => {
        playClick();
        if (isHost) {
            startGame();
        }
    });

    document.getElementById('back-btn-host').addEventListener('click', () => {
        location.reload();
    });

    document.getElementById('back-btn-join').addEventListener('click', () => {
        location.reload();
    });

    // Share buttons
    document.getElementById('share-btn').addEventListener('click', () => {
        playClick();
        if (currentRoomCode) {
            shareGame(currentRoomCode);
        }
    });

    document.getElementById('ingame-invite-btn').addEventListener('click', () => {
        playClick();
        if (currentRoomCode) {
            shareGame(currentRoomCode);
        }
    });
}

// ============== INIT ==============
function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');

    // Initialize user identity
    myUserId = getOrCreateUserId();
    myName = getPlayerName();
    myLifetimeStats = loadLifetimeStats();
    console.log('User ID:', myUserId, 'Name:', myName);
    console.log('Lifetime stats:', myLifetimeStats);

    // Save stats periodically and on page unload
    setInterval(saveCurrentStats, 30000); // Every 30 seconds
    window.addEventListener('beforeunload', saveCurrentStats);

    setupMenu();

    // Check for auto-join link (after menu setup so buttons work)
    if (checkAutoJoin()) {
        setupInput();
        setupFullscreen();
        return;
    }
    setupInput();
    setupFullscreen();

    // Check for bot mode via URL parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get('bot') === 'true') {
        isBot = true;
        myName = 'Bot_' + generateNickname();
        console.log('Bot mode enabled - auto-hosting as', myName);

        // Auto-start as host with bot
        document.getElementById('main-menu').classList.add('hidden');
        document.getElementById('host-menu').classList.remove('hidden');
        setupHost();

        // Wait for peer connection then auto-start game
        const checkAndStart = setInterval(() => {
            if (myId) {
                clearInterval(checkAndStart);
                document.getElementById('status').textContent = 'Bot hosting! Join with the code above.';
                startGame();
            }
        }, 500);
    }
}

// Start when page loads
window.addEventListener('load', init);
