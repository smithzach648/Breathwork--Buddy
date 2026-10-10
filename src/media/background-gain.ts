type Envelope = { from: number; to: number; start: number; duration: number };
/** The only writer of media.volume: base × transport envelope × voice envelope. */
export class BackgroundGain {
    private base = 0.32;
    private enabled = true;
    private transport = 0;
    private duck = 1;
    private transportFade?: Envelope;
    private duckFade?: Envelope;
    private frame?: ReturnType<typeof setInterval>;
    private restore?: ReturnType<typeof setTimeout>;
    private generation = 0;
    private input = false;
    private held = false;
    private writes = 0;
    constructor(private element: HTMLAudioElement, private paused: () => void) { this.write(); }
    private sample(envelope: Envelope | undefined, value: number, now: number) {
        return envelope ? envelope.from + (envelope.to - envelope.from) * Math.min(1, Math.max(0, (now - envelope.start) / envelope.duration)) : value;
    }
    private update() {
        const now = performance.now();
        this.transport = this.sample(this.transportFade, this.transport, now);
        this.duck = this.sample(this.duckFade, this.duck, now);
        const pause = this.transportFade?.to === 0 && now >= this.transportFade.start + this.transportFade.duration;
        if (this.transportFade && now >= this.transportFade.start + this.transportFade.duration) this.transportFade = undefined;
        if (this.duckFade && now >= this.duckFade.start + this.duckFade.duration) this.duckFade = undefined;
        this.write();
        if (!this.transportFade && !this.duckFade) { if (this.frame) clearInterval(this.frame); this.frame = undefined; }
        if (pause) this.paused();
    }
    private write() { const value = Math.max(0, Math.min(1, this.base * this.transport * this.duck)); if (this.element.volume !== value) { this.element.volume = value; this.writes++; } }
    private arm() {
        if (this.frame) return;
        const generation = this.generation;
        this.frame = setInterval(() => { if (generation === this.generation) this.update(); }, 25);
    }
    private clearRestore() { if (this.restore) clearTimeout(this.restore); this.restore = undefined; }
    setBase(base: number, enabled: boolean) {
        this.base = base; this.enabled = enabled;
        if (!enabled) { this.clearRestore(); this.held = false; this.toDuck(1); }
        else if (this.input) this.setVoice(true);
        this.write();
    }
    play(milliseconds = 700) {
        this.update();
        if (this.transportFade?.to === 1 || this.transport === 1 && !this.transportFade) return;
        this.transportFade = { from: this.transport, to: 1, start: performance.now(), duration: milliseconds }; this.arm();
    }
    pause(milliseconds = 700) {
        this.update(); this.clearRestore(); this.input = false; this.held = false;
        // Preserve the audible level when clearing ducking, then fade that level to silence.
        this.transport *= this.duck; this.duck = 1; this.duckFade = undefined;
        this.transportFade = { from: this.transport, to: 0, start: performance.now(), duration: milliseconds }; this.arm();
    }
    private toDuck(to: number) {
        this.update();
        if (this.duckFade?.to === to || this.duck === to && !this.duckFade) return;
        this.duckFade = { from: this.duck, to, start: performance.now(), duration: 250 }; this.arm();
    }
    setVoice(active: boolean) {
        this.input = active;
        if (!this.enabled) return;
        if (active) { this.clearRestore(); if (!this.held) { this.held = true; this.toDuck(.4); } }
        else if (this.held && !this.restore) {
            const generation = this.generation;
            // Bridge the measured 0.11–0.26 s gaps between countdown words; no cue is delayed.
            this.restore = setTimeout(() => { this.restore = undefined; if (generation !== this.generation || this.input) return; this.held = false; this.toDuck(1); }, 300);
        }
    }
    reset() {
        ++this.generation; this.clearRestore(); if (this.frame) clearInterval(this.frame); this.frame = undefined;
        this.transportFade = this.duckFade = undefined; this.transport = 0; this.duck = 1; this.input = this.held = false; this.write();
    }
    diagnostics() { return { base: this.base, transport: this.transport, duckFactor: this.duck, voiceInput: this.input, voiceHeld: this.held, effectiveVolume: this.element.volume, transportFade: this.transportFade ? { ...this.transportFade } : null, duckFade: this.duckFade ? { ...this.duckFade } : null, pendingRestore: !!this.restore, pendingFrame: !!this.frame, generation: this.generation, writes: this.writes }; }
}
