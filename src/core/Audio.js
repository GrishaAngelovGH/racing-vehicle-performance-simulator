let audioCtx, engineGain, audioInitialized = false;
let soundEnabled = true;
let primaryOsc1, primaryOsc2, whineOsc, modulator, modGain, noiseNode, noiseGain, bandpass;

export function isAudioInitialized() {
    return audioInitialized;
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

export function initAudio() {
    if (audioInitialized) return;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Main Volume
    engineGain = audioCtx.createGain();
    engineGain.gain.setValueAtTime(0, audioCtx.currentTime);
    engineGain.connect(audioCtx.destination);

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

    if (!soundEnabled || !simulationRunning) {
        engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
        return;
    }

    const speedRatio = speed / maxSpeed;
    const now = audioCtx.currentTime;

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
}
