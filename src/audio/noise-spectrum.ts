import type { NoiseColor } from '../settings/preferences';
/** Radix-2 transform. Cooperative yields keep generation off the timing/React path. */
export function* fftSteps(real: Float32Array, imaginary: Float32Array, inverse = false): Generator<void, void> {
    const n = real.length;
    for (let i=1,j=0;i<n;i++) {
        let bit = n >> 1; for (;j & bit;bit >>= 1) j ^= bit; j ^= bit;
        if (i<j) { [real[i],real[j]]=[real[j],real[i]]; [imaginary[i],imaginary[j]]=[imaginary[j],imaginary[i]]; }
        if (!(i % 65536)) yield;
    }
    for (let length=2;length<=n;length*=2) {
        const angle=(inverse?2:-2)*Math.PI/length, wr=Math.cos(angle),wi=Math.sin(angle);
        for (let start=0;start<n;start+=length) {
            let r=1,im=0;
            for (let j=0;j<length/2;j++) {
                const a=start+j,b=a+length/2,tr=real[b]*r-imaginary[b]*im,ti=real[b]*im+imaginary[b]*r;
                real[b]=real[a]-tr;imaginary[b]=imaginary[a]-ti;real[a]+=tr;imaginary[a]+=ti;
                const next=r*wr-im*wi;im=r*wi+im*wr;r=next;
            }
        }
        yield;
    }
    if (inverse) for(let i=0;i<n;i++){real[i]/=n;imaginary[i]/=n;}
}
/** Periodic Fourier synthesis: no join splice, DC bin zero; two independent channels. */
export function* noiseSteps(color: NoiseColor, sampleRate: number, size = 1<<20, random = Math.random): Generator<void, Float32Array<ArrayBuffer>> {
    if (!['white','pink','brown'].includes(color) || !Number.isFinite(sampleRate) || sampleRate<8000 || size<1024 || (size & (size-1)) || size>(1<<20)) throw new Error('Invalid noise synthesis parameters.');
    const real=new Float32Array(size),imaginary=new Float32Array(size),power=color==='white'?0:color==='pink'?1:2;
    for(let k=1;k<size/2;k++) {
        const frequency=Math.max(color==='brown'?40:20,k*sampleRate/size),scale=Math.pow(frequency,-power/2);
        const amplitude=Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*scale,angle=2*Math.PI*random();
        real[k]=real[size-k]=amplitude*Math.cos(angle);imaginary[k]=amplitude*Math.sin(angle);imaginary[size-k]=-imaginary[k];
        if (!(k%65536)) yield;
    }
    yield* fftSteps(real,imaginary,true);
    let sum=0;for(const sample of real)sum+=sample;const mean=sum/size;
    let energy=0,peak=0;for(let i=0;i<size;i++){real[i]-=mean;energy+=real[i]*real[i];peak=Math.max(peak,Math.abs(real[i]));}
    const gain=Math.min(.12/Math.sqrt(energy/size),.5/peak);
    for(let i=0;i<size;i++)real[i]*=gain;
    return real;
}
export function generateNoise(color: NoiseColor, sampleRate: number, size: number, random?: () => number) { const generator=noiseSteps(color,sampleRate,size,random);let step=generator.next();while(!step.done)step=generator.next();return step.value; }
export async function generateNoiseBuffer(context: AudioContext, color: NoiseColor, cancelled: () => boolean) {
    const size=1<<20,buffer=context.createBuffer(2,size,context.sampleRate);
    for(let channel=0;channel<2;channel++) {
        const generator=noiseSteps(color,context.sampleRate,size);let step=generator.next();
        while(!step.done) { await new Promise(resolve=>setTimeout(resolve,0));if(cancelled())throw new Error('Noise generation cancelled');step=generator.next(); }
        buffer.copyToChannel(step.value,channel);
    }
    return buffer;
}
/** Listening textures retain legacy color IDs, but deliberately soften their spectra. */
export const maskingProfiles = {
    brown: { name: 'Warm', low: 60, high: 1400, power: 2 },
    pink: { name: 'Balanced', low: 90, high: 1800, power: 1 },
    white: { name: 'Broad Masking', low: 120, high: 3500, power: 0 },
} as const;
export function* maskingSteps(color: NoiseColor, rate: number, size=1<<20, random=Math.random): Generator<void,Float32Array<ArrayBuffer>> {
    const profile=maskingProfiles[color];
    if (!profile || !Number.isFinite(rate) || rate<8000 || size<1024 || size>1<<20 || size&(size-1)) throw new Error('Invalid masking parameters.');
    const real=new Float32Array(size),imaginary=new Float32Array(size);
    for(let k=1;k<size/2;k++) {
        const f=k*rate/size,scale=Math.pow(Math.max(profile.low,f),-profile.power/2)/Math.sqrt(1+(profile.low/f)**4)/Math.sqrt(1+(f/profile.high)**6),phase=2*Math.PI*random();
        real[k]=real[size-k]=scale*Math.cos(phase);imaginary[k]=scale*Math.sin(phase);imaginary[size-k]=-imaginary[k];if(!(k%65536))yield;
    }
    yield* fftSteps(real,imaginary,true);
    const width=Math.min(Math.round(rate*.5),size),half=Math.floor(width/2),envelope=new Float32Array(size);
    let total=0,energy=0;for(const sample of real)total+=sample*sample;const target=total/size;
    for(let j=-half;j<width-half;j++)energy+=real[(j+size)%size]**2;
    // Static, circular energy calibration. No playback AGC or moving gain controller.
    for(let i=0;i<size;i++){envelope[i]=Math.min(1.25,Math.max(.8,Math.sqrt(target/(energy/width))));energy+=real[(i+width-half)%size]**2-real[(i-half+size)%size]**2;if(!(i%65536))yield;}
    let sum=0;for(let i=0;i<size;i++){real[i]*=envelope[i];sum+=real[i];}const mean=sum/size;let peak=0,rms=0;
    for(let i=0;i<size;i++){real[i]-=mean;rms+=real[i]**2;peak=Math.max(peak,Math.abs(real[i]));}const gain=Math.min(.1/Math.sqrt(rms/size),.5/peak);for(let i=0;i<size;i++)real[i]*=gain;return real;
}
export function generateMasking(color:NoiseColor,rate:number,size:number,random?:()=>number){const generator=maskingSteps(color,rate,size,random);let step=generator.next();while(!step.done)step=generator.next();return step.value;}
export async function generateMaskingBuffer(context:AudioContext,color:NoiseColor,cancelled:()=>boolean){
    const generator=maskingSteps(color,context.sampleRate);let step=generator.next();
    while(!step.done){await new Promise(resolve=>setTimeout(resolve,0));if(cancelled())throw new Error('Masking generation cancelled');step=generator.next();}
    if(cancelled())throw new Error('Masking generation cancelled');const buffer=context.createBuffer(2,step.value.length,context.sampleRate);buffer.copyToChannel(step.value,0);buffer.copyToChannel(step.value,1);return buffer;
}
