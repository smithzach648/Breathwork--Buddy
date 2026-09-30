export type AudioCategory = 'voice' | 'breath' | 'ambience' | 'signals';
export type AudioBus = 'master' | AudioCategory;
export interface AudioAsset {
    id: string;
    category: AudioCategory;
    name: string;
    localPath: string;
    durationSeconds?: number;
    loop: boolean;
    available: boolean;
    sourceNotes?: string;
}
const groups = { voice: ['in', 'out', 'hold-60', 'hold-90', 'recovery-breath', 'hold', 'five', 'four', 'three', 'two', 'one'], breath: ['inhale', 'exhale'], ambience: ['rain', 'forest', 'ocean', 'stream', 'fireplace', 'night'] };
export const audioCatalog: readonly AudioAsset[] = Object.entries(groups).flatMap(([category, ids]) => ids.map(id => ({ id: `${category}/${id}`, category: category as AudioCategory, name: id.replaceAll('-', ' '), localPath: `audio/${category}/${id}.mp3`, loop: category === 'ambience', available: false })));
export function availableAudio() { return audioCatalog.filter(asset => asset.available); }
/** Conceptual boundary only; no playback or scheduling. */
export interface AudioMixer {
    setVolume(bus: AudioBus, volume: number): void;
    stopAll(): void;
}
