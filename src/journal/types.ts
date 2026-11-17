export interface JournalEntry {
    id: string;
    createdAt: string;
    updatedAt: string;
    text: string;
    title?: string;
    feeling?: string;
    sessionId?: string;
    sessionName?: string;
}
