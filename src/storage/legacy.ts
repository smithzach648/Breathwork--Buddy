export type LegacyStatus = 'present' | 'absent' | 'unavailable';
/** Presence only. Do not parse, migrate, rewrite, or remove this record in Phase 1. */
export function detectLegacyData(): LegacyStatus { try {
    return localStorage.getItem('breathwork_data') === null ? 'absent' : 'present';
}
catch {
    return 'unavailable';
} }
export interface LegacyMigration {
    validate(raw: unknown): {
        valid: boolean;
        issues: string[];
    };
    preview(raw: unknown): unknown;
}
// Future migration must validate journal, saved patterns, retention history, dark mode
// and orientation; account for the legacy unshift()/slice(-100) journal retention bug.
