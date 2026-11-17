export type SoftInstrument = 'felt' | 'wooden';
export const INSTRUMENTS = {
  felt: { partials:[0,1,.055,.012], attack:.075, release:.24, decay:2.8 },
  wooden: { partials:[0,1,.12,.035], attack:.095, release:.28, decay:2.2 },
} as const;
export const SOFT_NOTE_SECONDS=.86;
const waves=new WeakMap<BaseAudioContext,Map<SoftInstrument,PeriodicWave>>();
export function instrumentEnvelope(instrument:SoftInstrument='felt') {
  const spec=INSTRUMENTS[instrument];
  return Float32Array.from({length:129},(_,i)=>{
    const t=i/128*SOFT_NOTE_SECONDS;
    const attack=Math.sin(Math.min(1,t/spec.attack)*Math.PI/2)**2;
    const body=Math.exp(-spec.decay*Math.max(0,t-spec.attack));
    const release=Math.sin(Math.min(1,(SOFT_NOTE_SECONDS-t)/spec.release)*Math.PI/2)**2;
    return attack*body*release;
  });
}
export function instrumentWave(context:BaseAudioContext,instrument:SoftInstrument='felt') {
  let cache=waves.get(context);if(!cache){cache=new Map();waves.set(context,cache);}
  let wave=cache.get(instrument);
  if(!wave){const imaginary=Float32Array.from(INSTRUMENTS[instrument].partials),real=new Float32Array(imaginary.length);wave=context.createPeriodicWave(real,imaginary,{disableNormalization:true});cache.set(instrument,wave);}
  return wave;
}
/** The same note instrument is used by native live playback and the offline A/B renderer. */
export function scheduleSoftNote(context:BaseAudioContext,input:AudioNode,hz:number,when:number,hold=false,instrument:SoftInstrument='felt') {
  const oscillator=context.createOscillator(),gain=context.createGain();
  oscillator.setPeriodicWave(instrumentWave(context,instrument));oscillator.frequency.setValueAtTime(hz,when);
  oscillator.connect(gain);gain.connect(input);
  const level=hold?.175:.25,curve=instrumentEnvelope(instrument);
  for(let i=0;i<curve.length;i++)curve[i]*=level;
  gain.gain.setValueCurveAtTime(curve,when,SOFT_NOTE_SECONDS);
  oscillator.start(when);oscillator.stop(when+SOFT_NOTE_SECONDS);
  return {oscillator,gain};
}
