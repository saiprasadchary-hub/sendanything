// Simple synth using AudioContext to avoid external assets
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playTone = (freq: number, type: OscillatorType, duration: number, delay = 0) => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
};

export const playSound = {
    click: () => playTone(800, 'sine', 0.1),
    hover: () => playTone(400, 'triangle', 0.05),
    success: () => {
        playTone(600, 'sine', 0.1);
        playTone(800, 'sine', 0.2, 0.1);
        playTone(1200, 'sine', 0.4, 0.2);
    },
    error: () => {
        playTone(150, 'sawtooth', 0.3);
        playTone(100, 'sawtooth', 0.3, 0.1);
    },
    connect: () => {
        playTone(500, 'sine', 0.1);
        playTone(1000, 'sine', 0.2, 0.1);
    },
    swoosh: () => {
        // Noise buffer for swoosh? Too complex, sticking to simple slide
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
};
