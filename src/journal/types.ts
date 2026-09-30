export interface JournalEntry {
    id: string;
    createdAt: string;
    updatedAt: string;
    text: string;
    sessionId?: string;
}
