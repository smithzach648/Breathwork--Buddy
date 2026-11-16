import type { JourneyConfig, Section } from './model';
export interface NarrationAsset {
  id: string; language: 'en'; script: string; assetId?: string; decodedDurationSeconds?: number;
}
/** Original text only. No ElevenLabs request or unapproved recording is bundled or fetched. */
export const NARRATION_MANIFEST = {
  version: 'preparation-text.1',
  assets: {
    ecb: { id: 'suite.ecb.1', language: 'en', script: "Notice what's asking for your attention. You don't have to solve it now. Imagine setting it somewhere you can return to later." },
    breathwork: { id: 'suite.breathwork.1', language: 'en', script: 'Follow the rising notes as you breathe in and the falling notes as you breathe out. Steady notes mark a comfortable hold. Breathe naturally whenever you need to.' },
    relaxation: { id: 'suite.relaxation.1', language: 'en', script: 'Let your forehead soften, your shoulders settle, and your hands rest. There is nothing you need to make happen. Let the rest of your body follow at its own pace.' },
    tuning: { id: 'suite.tuning.1', language: 'en', script: 'If you like, make a soft hum on a comfortable out-breath. Notice the sensation, then let it fade. Quiet, natural breathing is equally welcome.' },
    space: { id: 'suite.space.1', language: 'en', script: 'Notice the space around you. You might imagine a gentle boundary or sphere, or simply feel the room supporting you. No image is required.' },
    affirmation: { id: 'suite.affirmation.1', language: 'en', script: 'I give myself time to rest and explore. I can notice what comes without forcing an answer. I can return whenever I choose.' },
    entry: { id: 'suite.entry.1', language: 'en', script: 'Allow your body to rest while you remain quietly aware. Let these words fall away, and take a little space for yourself.' },
    threshold: { id: 'suite.threshold.1', language: 'en', script: 'Rest here. Nothing to search for. Simply notice what comes.' },
    expansion: { id: 'suite.expansion.1', language: 'en', script: 'Now let your attention become a little more spacious. Nothing to search for. Just notice what comes.' },
    timeless: { id: 'suite.timeless.1', language: 'en', script: 'For a little while, you can let go of keeping track of time.' },
    return: { id: 'suite.return.1', language: 'en', script: "Begin noticing the room around you. Move when you're ready, and take your time opening your eyes." },
  } satisfies Record<Section, NarrationAsset>,
} as const;
export const hasApprovedNarration = () => Object.values(NARRATION_MANIFEST.assets).some(asset => !!(asset as NarrationAsset).assetId);
export function guidanceText(config: JourneyConfig, section: Section, elapsedInSection = 0) {
  if (section === 'breathwork' && config.breathing === 'natural') return 'Let your breath find its own comfortable rhythm. There is no counting or holding to follow.';
  if (section === 'return') {
    if (elapsedInSection >= 120) return 'When you are ready, open your eyes. Notice one thing you want to carry into your day. Take your time.';
    if (elapsedInSection >= 60) return 'Feel the support beneath you. Gently move your hands and feet, and notice the room.';
  }
  if (section === 'tuning' && !config.humming) return 'Rest quietly and breathe naturally. No humming is needed.';
  if (section === 'space' && !config.surroundingSpace) return 'Feel the support beneath you and notice the room around you. No imagery is needed.';
  if (section === 'affirmation' && config.affirmation === 'spiritual') return 'I welcome this time with openness and gratitude. May my exploration be kind, constructive, and guided by what I hold sacred. I can return whenever I choose.';
  if (config.guidance === 'familiar' && ['threshold', 'expansion', 'timeless'].includes(section)) return 'A little space to rest and notice.';
  if (config.guidance === 'familiar' && section === 'ecb') return 'Set concerns aside for now. You can return to them later.';
  return NARRATION_MANIFEST.assets[section].script;
}
/** Future approved clips must fit their slot, with a bowl gap and no overlap into the first paced note. */
export function narrationFits(asset: NarrationAsset, slot: { start: number; end: number }, bowlAt?: number) {
  if (!asset.assetId) return false;
  const duration = asset.decodedDurationSeconds;
  return Number.isFinite(duration) && duration! > 0 && slot.end > slot.start && slot.start + duration! <= slot.end && (bowlAt === undefined || slot.start >= bowlAt + 16);
}
