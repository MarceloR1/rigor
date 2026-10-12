class AudioSynth {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    playTone({ type, freqStart, freqRamps, volume, gainEnd, duration }) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        freqRamps.forEach(({ value, time, method }) => {
            osc.frequency[method](value, now + time);
        });
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(gainEnd, now + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(now + duration);
    }

    playClick() {
        this.playTone({
            type: 'sine',
            freqStart: 600,
            volume: 0.1,
            gainEnd: 0.01,
            duration: 0.05,
            freqRamps: [{ value: 200, time: 0.05, method: 'exponentialRampToValueAtTime' }],
        });
    }

    playFootstep() {
        this.playTone({
            type: 'triangle',
            freqStart: 80,
            volume: 0.08,
            gainEnd: 0.001,
            duration: 0.08,
            freqRamps: [{ value: 30, time: 0.08, method: 'exponentialRampToValueAtTime' }],
        });
    }

    playJumpscare() {
        this.playTone({
            type: 'sawtooth',
            freqStart: 120,
            volume: 0.4,
            gainEnd: 0.01,
            duration: 0.5,
            freqRamps: [{ value: 750, time: 0.4, method: 'linearRampToValueAtTime' }],
        });
    }

    playPickup() {
        this.playTone({
            type: 'sine',
            freqStart: 523.25,
            volume: 0.2,
            gainEnd: 0.01,
            duration: 0.3,
            freqRamps: [{ value: 659.25, time: 0.1, method: 'setValueAtTime' }],
        });
    }
}

export const audio = new AudioSynth();
