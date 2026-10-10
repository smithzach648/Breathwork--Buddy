import type { SessionResult } from '../../types/domain';
import { formatDuration } from '../../shared/format';

/** Optional additive fields keep earlier History rows readable. */
export function BlockDetails({ block }: { block: NonNullable<SessionResult['blocks']>[number] }) {
    const pattern = block.customPattern, round = block.hormesisRound;
    return <>
        {(block.kind === 'meditation' || block.kind === 'settling') && <span> · {formatDuration(block.actualDurationSeconds)} of {formatDuration(block.plannedDurationSeconds)}</span>}
        {pattern && <span> · {pattern.completedCycles} of {pattern.requestedCycles} cycles · inhale {pattern.inhaleSeconds}s / hold {pattern.holdInSeconds}s / exhale {pattern.exhaleSeconds}s / hold {pattern.holdOutSeconds}s (0 = no hold)</span>}
        {round && <span> · {round.preparationBreaths} breaths at {round.intervalSeconds}s each · {round.retentionTargetSeconds}s optional target · recovery {round.recoveryCompleted ? 'completed' : block.outcome === 'not-started' ? 'not started' : 'incomplete'}</span>}
        {!!block.retentions.length && <span className="muted"> · Retentions: {block.retentions.map(retention => `${retention.durationSeconds.toFixed(1)}s${retention.outcome === 'released' ? ' (released)' : retention.outcome === 'cancelled' ? ' (cancelled)' : ''}`).join(' / ')}</span>}
    </>;
}
