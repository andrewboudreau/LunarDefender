// ===========================================
// Lunar Defender - Audio System
// ===========================================

let audioCtx = null;
let masterGain = null;
let thrustGain = null;
let thrustNoise = null;
let thrustFilter = null;

export function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
}

export function ensureAudio() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Shoot sound - dense bassy "pew"
export function playShoot() {
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
export function playExplosion(size = 0) {
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
export function startThrust() {
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

export function stopThrust() {
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
export function playChime() {
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
export function playSuccess() {
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
export function playCrash() {
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
export function playClick() {
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

// Subtle rock collision sound
export function playRockCollision(speed) {
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
