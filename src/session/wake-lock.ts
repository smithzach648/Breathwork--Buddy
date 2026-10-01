export interface ScreenLock {
    released: boolean;
    release(): Promise<void>;
    addEventListener(type: 'release', listener: () => void): void;
}
export class WakeLockController {
    private sessionId: string | null = null;
    private sentinel: ScreenLock | undefined;
    private generation = 0;
    private pending = false;
    constructor(private request: (() => Promise<ScreenLock>) | undefined, private visible: () => boolean) { }
    setSession(sessionId: string | null) {
        if (sessionId === this.sessionId)
            return;
        this.generation++;
        this.pending = false;
        this.sessionId = sessionId;
        this.clear();
        if (sessionId)
            this.acquire();
    }
    visibilityChanged() {
        if (!this.visible()) {
            this.generation++;
            this.pending = false;
            this.clear();
        }
        else
            this.acquire();
    }
    private clear() { const lock = this.sentinel; this.sentinel = undefined; if (lock)
        void lock.release().catch(() => { }); }
    private acquire() {
        if (!this.request || !this.sessionId || !this.visible() || this.pending || this.sentinel)
            return;
        this.pending = true;
        const generation = this.generation;
        const sessionId = this.sessionId;
        void this.request().then(lock => {
            if (generation !== this.generation || sessionId !== this.sessionId || !this.visible()) {
                void lock.release().catch(() => { });
                return;
            }
            this.sentinel = lock;
            lock.addEventListener('release', () => { if (this.sentinel === lock)
                this.sentinel = undefined; });
        }).catch(() => { }).finally(() => { if (generation === this.generation)
            this.pending = false; });
    }
}
