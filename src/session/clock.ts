export interface Clock {
    now(): number;
}
export interface Scheduler {
    at(deadline: number, callback: () => void): () => void;
}
/** Monotonic milliseconds. Callbacks are wakeups, never elapsed-time truth. */
export class BrowserTiming implements Clock, Scheduler {
    now() { return performance.now(); }
    at(deadline: number, callback: () => void) { const timer = setTimeout(callback, Math.max(0, deadline - this.now())); return () => clearTimeout(timer); }
}
