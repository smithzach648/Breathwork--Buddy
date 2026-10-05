/** Decoded from the user's local recordings. Never read runtime playback to time stages. */
export const voiceDurations = Object.freeze({
    'voice.prepare': 3.474285714285714,
    'voice.round1': 2.9257142857142857,
    'voice.round2': 1.6457142857142857,
    'voice.finalRound': 1.8024489795918368,
    'voice.recoveryInhaleHold15': 4.989387755102041,
    'voice.recoveryExhale': 3.239183673469388,
});
export const roundVoiceIds = ['voice.round1', 'voice.round2', 'voice.finalRound'] as const;
export const roundAnnouncementMs = Object.freeze(roundVoiceIds.map(id => Math.ceil(voiceDurations[id] * 1000) + 400));
