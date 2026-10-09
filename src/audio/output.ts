/** Fixed stereo headroom, with a memoryless safety ceiling rather than a pumping compressor. */
export const outputTrim=.25;
export function outputCurve(){const curve=new Float32Array(32769);for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.85?a:.85+.1*Math.tanh((a-.85)/.1));}return curve;}
export function createOutput(context:BaseAudioContext){const trim=context.createGain();trim.gain.value=outputTrim;if(context.createWaveShaper){const ceiling=context.createWaveShaper();ceiling.curve=outputCurve();ceiling.oversample='4x';trim.connect(ceiling);ceiling.connect(context.destination);}else trim.connect(context.destination);return trim;}
