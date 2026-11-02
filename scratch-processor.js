import {ScratchVoice} from './scratch-dsp.js';
class SideAScratch extends AudioWorkletProcessor {
  constructor() {
    super();this.voice=new ScratchVoice();
    this.port.onmessage=({data})=>{
      if(data.type==='load') this.voice.load(data.channels,data.sampleRate);
      if(data.type==='start') this.voice.start(data.position);
      if(data.type==='move') this.voice.move(data.position,data.rate);
      if(data.type==='stop') this.voice.stop();
      if(data.type==='release') this.voice.load([],0);
    };
  }
  process(inputs,outputs) {this.voice.process(outputs[0],sampleRate);return true;}
}
registerProcessor('side-a-scratch',SideAScratch);
