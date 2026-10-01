import type { Clock, Scheduler } from '../session/clock';
export class FakeTiming implements Clock, Scheduler {
    time = 0;
    jobs: {
        at: number;
        callback: () => void;
        cancelled: boolean;
    }[] = [];
    now = () => this.time;
    at = (at: number, callback: () => void) => { const job = { at, callback, cancelled: false }; this.jobs.push(job); return () => { job.cancelled = true; }; };
    advance(ms: number) { const end = this.time + ms; let steps = 0; while (true) {
        const next = this.jobs.filter(j => !j.cancelled && j.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next)
            break;
        if (++steps > 100000)
            throw new Error('Scheduler loop');
        next.cancelled = true;
        this.time = Math.max(this.time, next.at);
        next.callback();
    } this.time = end; }
    jump(ms: number) { this.time += ms; }
}
