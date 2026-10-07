import { voiceDurations } from './voice-metadata';
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
const asset = (id: string, category: AudioCategory, file: string, durationSeconds?: number): AudioAsset => ({ id, category, name: file.replace(/\.mp3$/, ''), localPath: `audio/${category}/${file}`, durationSeconds, loop: category === 'ambience', available: true, sourceNotes: category === 'ambience' ? 'myNoise; user-supplied personal-use track; publication explicitly authorized.' : 'User-supplied local recording.' });
export const audioCatalog: readonly AudioAsset[] = [
    asset('voice.in', 'voice', 'voice.breath-in.wav', 1.01), asset('voice.out', 'voice', 'voice.breath-out.wav', 0.83),
    asset('voice.hold60', 'voice', 'voice.60 second hold.wav', 2.72), asset('voice.hold90', 'voice', 'voice.90 second hold.wav', 2.65),
    asset('voice.hold', 'voice', 'voice.Hold.wav', 1.03),
    ...['one', 'two', 'three', 'four', 'five'].map((name, i) => asset(`voice.${name}`, 'voice', `voice.count-${i + 1}.wav`, [0.79, 0.74, 0.79, 0.86, 0.89][i])),
    asset('voice.prepare', 'voice', 'voice.Prepare.mp3', voiceDurations['voice.prepare']),
    asset('voice.fullExhale', 'voice', 'voice.Full Exhale.mp3', 2.115918367346939),
    asset('voice.round1', 'voice', 'voice.Round 1.mp3', voiceDurations['voice.round1']),
    asset('voice.round2', 'voice', 'voice.Round 2.mp3', voiceDurations['voice.round2']),
    asset('voice.finalRound', 'voice', 'voice.Final round.mp3', voiceDurations['voice.finalRound']),
    asset('voice.recoveryInhaleHold15', 'voice', 'voice.Recovery breath inhale 15 second hold.mp3', voiceDurations['voice.recoveryInhaleHold15']),
    asset('voice.recoveryExhale', 'voice', 'voice.Recovery breath exhale.mp3', voiceDurations['voice.recoveryExhale']),
    asset('breath.in4', 'breath', 'Inhale 4 second.wav', 3.91), asset('breath.in6', 'breath', 'Inhale 6 second.wav', 5.87),
    asset('breath.out4', 'breath', 'Exhale 4 seconds.wav', 3.91), asset('breath.out8', 'breath', 'Exhale 8 seconds.wav', 7.87),
    asset('ambience.floating', 'ambience', 'Floating.mp3', 600), asset('ambience.homeAgain', 'ambience', 'Home Again.mp3', 600),
];
export function resolveAsset(id: string) { return audioCatalog.find(asset => asset.id === id && asset.available); }
export function availableAudio() { return audioCatalog.filter(asset => asset.available); }
export function assetUrl(asset: AudioAsset, base = import.meta.env.BASE_URL) { return base + asset.localPath.split('/').map(encodeURIComponent).join('/'); }
