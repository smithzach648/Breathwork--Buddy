import type {ExerciseConfig} from '../../session/config';
import {HORMESIS_SAFETY,hormesisOption} from '../../session/hormesis';
export function HormesisDetails({config}:{config:Extract<ExerciseConfig,{kind:'hormesis'}>}){
 const p=hormesisOption(config);if(!p)return null;
 return <><p className="muted">{p.retentions.length===2?'Two':'Three'} rounds · {p.cycles} breaths per round · {p.intervalSeconds} seconds in / {p.intervalSeconds} seconds out.</p><ol>{p.retentions.map((hold,i)=><li key={i}>Round {i+1}: {p.cycles} breaths, then up to {hold} seconds of optional retention.</li>)}</ol><p className="muted">A short two-note chime marks the final breath of each round: 4 seconds in, then 6 seconds out. A five-to-one countdown ends each retention target.</p><p className="muted">Recovery stays the same: inhale 4 seconds, comfortable hold up to 15, exhale 6, then settle for 3.</p><p className="notice">{HORMESIS_SAFETY}</p></>;
}
