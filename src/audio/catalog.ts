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
    asset('voice.in', 'voice', 'breath-in.mp3'), asset('voice.out', 'voice', 'breath-out.mp3'),
    asset('voice.hold60', 'voice', '60 second hold.mp3'), asset('voice.hold90', 'voice', '90 second hold.mp3'),
    asset('voice.recoveryBreath', 'voice', 'Recovery Breath.mp3'), asset('voice.hold', 'voice', 'Hold.mp3'),
    ...['one', 'two', 'three', 'four', 'five'].map((name, i) => asset(`voice.${name}`, 'voice', `count-${i + 1}.mp3`)),
    asset('breath.in4', 'breath', 'Inhale 4 second.mp3', 4), asset('breath.in6', 'breath', 'Inhale 6 second.mp3', 6),
    asset('breath.out4', 'breath', 'Exhale 4 seconds.mp3', 4), asset('breath.out8', 'breath', 'Exhale 8 seconds.mp3', 8),
    asset('ambience.floating', 'ambience', 'Floating.mp3', 600), asset('ambience.homeAgain', 'ambience', 'Home Again.mp3', 600),
];
export function resolveAsset(id: string) { return audioCatalog.find(asset => asset.id === id && asset.available); }
export function availableAudio() { return audioCatalog.filter(asset => asset.available); }
export function assetUrl(asset: AudioAsset, base = import.meta.env.BASE_URL) { return base + asset.localPath.split('/').map(encodeURIComponent).join('/'); }
