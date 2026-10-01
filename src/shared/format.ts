export function formatDuration(seconds: number) { const whole = Math.max(0, Math.ceil(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`; }
