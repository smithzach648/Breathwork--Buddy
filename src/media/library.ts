import { database, type BuddyDatabase } from '../storage/database';
import { assetUrl, resolveAsset } from '../audio/catalog';

export interface LocalMediaRecord {
    id: string;
    displayName: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    durationSeconds?: number;
    importedAt: string;
    blob: Blob;
}
export const builtins = [
    { id: 'ambience.floating', name: 'Floating' },
    { id: 'ambience.homeAgain', name: 'Home Again' },
] as const;
const offlineId = (id: string) => `offline:${id}`;
export function mediaError(error: unknown): string {
    const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
    return name === 'QuotaExceededError' ? 'Device storage is full. Remove an offline copy or local audio and try again.' : error instanceof Error ? error.message : 'Audio could not be saved on this device. Existing audio is safe.';
}
/** Probe a streaming element, not a decoded long-file buffer. Always revoke this temporary URL. */
export function probeAudio(blob: Blob): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
        const audio = new Audio();
        const url = URL.createObjectURL(blob);
        const finish = (error = false) => {
            clearTimeout(timeout);
            const duration = Number.isFinite(audio.duration) ? audio.duration : undefined;
            audio.oncanplay = null; audio.onerror = null;
            audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(url);
            if (error) reject(new Error('This browser cannot play that audio file. Try MP3, WAV, or another supported audio format.'));
            else resolve(duration);
        };
        const timeout = setTimeout(() => finish(true), 15000);
        audio.oncanplay = () => finish(); audio.onerror = () => finish(true);
        audio.preload = 'auto'; audio.src = url;
    });
}
export class MediaLibrary {
    constructor(private db: BuddyDatabase = database, private probe = probeAudio, private fetcher: typeof fetch = (...args) => fetch(...args)) {}
    list() { return this.db.media.orderBy('importedAt').toArray(); }
    get(id: string) { return this.db.media.get(id); }
    async import(file: File) {
        if (!file.size) throw new Error('Choose a non-empty audio file.');
        const durationSeconds = await this.probe(file);
        const record: LocalMediaRecord = { id: `local:${crypto.randomUUID()}`, displayName: file.name.replace(/\.[^.]+$/, ''), originalFilename: file.name, mimeType: file.type || 'application/octet-stream', byteSize: file.size, durationSeconds, importedAt: new Date().toISOString(), blob: file.slice(0, file.size, file.type) };
        await this.db.media.add(record); // Atomic single-row write: failures leave existing records intact.
        return record;
    }
    async download(id: string) {
        const asset = resolveAsset(id);
        if (!asset || asset.category !== 'ambience') throw new Error('Choose a built-in background track.');
        const response = await this.fetcher(assetUrl(asset));
        if (!response.ok) throw new Error('Download unavailable. Connect to the internet and try again.');
        const blob = await response.blob();
        if (!blob.size) throw new Error('Download was empty. Please try again.');
        const durationSeconds = await this.probe(blob);
        await this.db.media.put({ id: offlineId(id), displayName: asset.name, originalFilename: asset.name + '.mp3', mimeType: blob.type || 'audio/mpeg', byteSize: blob.size, durationSeconds, importedAt: new Date().toISOString(), blob });
    }
    remove(id: string) { return this.db.media.delete(id); }
    async resolve(id: string): Promise<{ url: string; owned: boolean; name: string }> {
        const builtin = builtins.find(item => item.id === id);
        const saved = await this.get(builtin ? offlineId(id) : id);
        if (saved) return { url: URL.createObjectURL(saved.blob), owned: true, name: saved.displayName };
        if (builtin) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error(`${builtin.name} is unavailable offline. Save an offline copy when connected.`);
            return { url: assetUrl(resolveAsset(id)!), owned: false, name: builtin.name };
        }
        throw new Error('That local audio is no longer available. Select another source.');
    }
}
export const mediaLibrary = new MediaLibrary();
export async function storageInfo() {
    const storage = navigator.storage;
    let estimate: StorageEstimate = {}, persistent: boolean | undefined;
    // Optional diagnostics must not hide a working IndexedDB library.
    try { if (storage?.estimate) estimate = await storage.estimate(); } catch { /* Unavailable estimate. */ }
    try { if (storage?.persisted) persistent = await storage.persisted(); } catch { /* Unavailable status. */ }
    return { usage: estimate.usage, quota: estimate.quota, persistent };
}
