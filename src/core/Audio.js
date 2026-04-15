let audioCtx, engineGain, audioInitialized = false;
let soundEnabled = false; // Match UI default
let primaryOsc1, primaryOsc2, whineOsc, modulator, modGain, noiseNode, noiseGain, bandpass;

// Real sound variables
let carSoundBuffer = null;
let carSoundSource = null;
let carSoundGain = null;
let soundMode = 'dynamic'; // 'dynamic' or 'real'

export function isAudioInitialized() {
    return audioInitialized;
}

export function getAudioContext() {
    return audioCtx;
}

export function isSoundEnabled() {
    return soundEnabled;
}

export function toggleSound() {
    soundEnabled = !soundEnabled;
    return soundEnabled;
}

export function enableSound() {
    soundEnabled = true;
    return soundEnabled;
}

export function setSoundMode(mode) {
    soundMode = mode;
}

export function getSoundMode() {
    return soundMode;
}

async function loadCarSound() {
    try {
        const response = await fetch('/src/assets/audio/car-sound.mp3');
        const arrayBuffer = await response.arrayBuffer();
        carSoundBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("Car sound MP3 loaded");
    } catch (e) {
        console.error("Error loading car sound:", e);
    }
}

function startCarSoundLoop() {
    if (!carSoundBuffer || !audioCtx) return;

    // Stop previous if any
    if (carSoundSource) {
        try { carSoundSource.stop(); } catch (e) { }
    }

    carSoundSource = audioCtx.createBufferSource();
    carSoundSource.buffer = carSoundBuffer;
    carSoundSource.loop = true;
    carSoundSource.connect(carSoundGain);
    carSoundSource.start(0);
}

export function initAudio() {
    if (audioInitialized) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Main Volume for Dynamic Engine
    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
    engineGain.connect(audioCtx.destination);

    // Gain for Real MP3 Engine
    carSoundGain = audioCtx.createGain();
    carSoundGain.gain.setValueAtTime(0, audioCtx.currentTime);
    carSoundGain.connect(audioCtx.destination);

    // 1. Primary Engine Layer (Detuned Sawtooths)
    primaryOsc1 = audioCtx.createOscillator();
    primaryOsc1.type = 'sawtooth';

    primaryOsc2 = audioCtx.createOscillator();
    primaryOsc2.type = 'sawtooth';
    primaryOsc2.detune.setValueAtTime(12, audioCtx.currentTime); // Slight detune for thickness

    // 2. FM Synthesis (adds metallic growl)
    modulator = audioCtx.createOscillator();
    modulator.type = 'sine';
    modGain = audioCtx.createGain();

    modulator.connect(modGain);
    modGain.connect(primaryOsc1.frequency);
    modGain.connect(primaryOsc2.frequency);

    // 3. Harmonic Whine (turbo/gear whine)
    whineOsc = audioCtx.createOscillator();
    whineOsc.type = 'triangle';
    const whineGain = audioCtx.createGain();
    whineGain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    whineOsc.connect(whineGain);

    // 4. Noise Layer (Exhaust/Air hiss)
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;
    noiseNode.loop = true;
    noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);

    // 5. Filtering & Mixing
    bandpass = audioCtx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.setValueAtTime(2, audioCtx.currentTime);

    primaryOsc1.connect(bandpass);
    primaryOsc2.connect(bandpass);
    whineGain.connect(bandpass);
    noiseNode.connect(noiseGain);
    noiseGain.connect(engineGain);

    bandpass.connect(engineGain);

    // Start all sources
    primaryOsc1.start();
    primaryOsc2.start();
    whineOsc.start();
    modulator.start();
    noiseNode.start();

    // Load external MP3
    loadCarSound();

    audioInitialized = true;

    // Resume context if suspended (browser requires user gesture)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function updateEngineSound(speed, maxSpeed, simulationRunning) {
    if (!audioInitialized) return;

    // Resume context if suspended (browser policy)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (!soundEnabled || !simulationRunning) {
        engineGain.gain.setTargetAtTime(0, now, 0.1);
        if (carSoundGain) carSoundGain.gain.setTargetAtTime(0, now, 0.1);
        return;
    }

    const speedRatio = speed / maxSpeed;

    if (soundMode === 'dynamic') {
        // Mute real sound
        if (carSoundGain) carSoundGain.gain.setTargetAtTime(0, now, 0.1);

        // --- ORIGINAL DYNAMIC SOUND LOGIC ---
        // Pitch calculation (higher speed = higher pitch)
        const baseFreq = 80; // idle growl
        const maxFreq = 750; // High-rev scream
        const targetFreq = baseFreq + (speedRatio * (maxFreq - baseFreq));

        // 1. Primary Layers
        primaryOsc1.frequency.setTargetAtTime(targetFreq, now, 0.1);
        primaryOsc2.frequency.setTargetAtTime(targetFreq, now, 0.1);

        // 2. FM Modulator (adds the "gritty" mechanical texture)
        modulator.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.1);
        const targetModDepth = 30 + speedRatio * 100;
        modGain.gain.setTargetAtTime(targetModDepth, now, 0.1);

        // 3. Harmonic Whine (Gearbox/Turbo)
        whineOsc.frequency.setTargetAtTime(targetFreq * 2.8, now, 0.1);

        // 4. White Noise (Air resistance & exhaust hiss)
        const targetNoiseVol = 0.01 + speedRatio * 0.06;
        noiseGain.gain.setTargetAtTime(targetNoiseVol, now, 0.1);

        // 5. Dynamic Filtering (Bandpass tracks RPM for resonance)
        const filterFreq = targetFreq * 2.2;
        bandpass.frequency.setTargetAtTime(filterFreq, now, 0.1);

        // 6. Master Volume
        const targetVolume = 0.07 + speedRatio * 0.13;
        engineGain.gain.setTargetAtTime(targetVolume, now, 0.2);
    } else {
        // Mute dynamic sound
        engineGain.gain.setTargetAtTime(0, now, 0.1);

        // Handle Real MP3 sound
        if (carSoundBuffer) {
            if (!carSoundSource) {
                startCarSoundLoop();
            }

            // Adjust playback rate (pitch) based on speed for "realism"
            // Base speed (60%) to max speed (160%)
            const playbackRate = 0.6 + (speedRatio * 1.0);
            if (carSoundSource) {
                carSoundSource.playbackRate.setTargetAtTime(playbackRate, now, 0.1);
            }

            // Volume control
            const targetVolume = 0.3 + (speedRatio * 0.4);
            carSoundGain.gain.setTargetAtTime(targetVolume, now, 0.2);
        }
    }
}

export function playFastestLapSound() {
    if (!audioInitialized || !soundEnabled) return;

    const now = audioCtx.currentTime;

    // A celebratory two-note chime (Perfect Fifth)
    const playNote = (freq, startTime, duration) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, startTime);

        g.gain.setValueAtTime(0, startTime);
        g.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(g);
        g.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    playNote(880, now, 0.4); // A5
    playNote(1320, now + 0.1, 0.5); // E6
}
