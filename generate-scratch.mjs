// Original 32-beat practice loop. Deterministic synthesis, no sampled recordings.
import {writeFile} from 'node:fs/promises';
const rate=24000,bpm=96,beat=60/bpm,seconds=32*beat,length=Math.round(rate*seconds);
const output=Buffer.alloc(44+length*2);
output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);
output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*2,28);
output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(length*2,40);
let seed=314159;
for(let i=0;i<length;i++){
  const t=i/rate,phase=t%beat,step=Math.floor(t/beat),half=t%(beat/2);
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;
  const kick=Math.sin(2*Math.PI*(48*phase+90*.025*(1-Math.exp(-phase/.025))))*Math.exp(-phase*22)*.62;
  const snare=step%2===1?(noise*.25+Math.sin(2*Math.PI*175*phase)*.13)*Math.exp(-phase*30):0;
  const hat=noise*.075*Math.exp(-half*95);
  const bassPhase=t%(beat*2),note=[65.406,65.406,77.782,58.27][Math.floor(step/4)%4];
  const bass=Math.sin(2*Math.PI*note*bassPhase)*Math.exp(-bassPhase*3)*.18;
  const chirp=step%4===3?Math.sin(2*Math.PI*(440*phase+100*phase*phase))*Math.exp(-phase*12)*.17:0;
  const fade=Math.min(1,t/.005,(seconds-t)/.012),sample=Math.tanh(kick+snare+hat+bass+chirp)*fade;
  output.writeInt16LE(Math.round(sample*29000),44+i*2);
}
await writeFile(new URL('./assets/scratch-study.wav',import.meta.url),output);
console.log('Wrote original 96 BPM scratch practice loop (20 seconds).');
