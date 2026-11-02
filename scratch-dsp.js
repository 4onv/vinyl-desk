// Signed-rate interpolation for owned/demo PCM only. Spotify streams never enter this processor.
export class ScratchVoice {
  constructor() {this.channels=[];this.active=false;this.gain=0;this.rate=0;this.targetRate=0;this.age=0;}
  load(channels,sampleRate) {this.channels=channels;this.sampleRate=sampleRate;this.stop();}
  start(seconds) {this.position=Math.max(0,seconds*this.sampleRate);this.goal=this.position;this.active=true;this.gain=0;this.rate=0;this.targetRate=0;this.age=0;}
  move(seconds,rate) {this.goal=seconds*this.sampleRate;this.targetRate=Math.max(-6,Math.min(6,rate));this.age=0;}
  stop() {this.active=false;this.gain=0;this.targetRate=0;this.rate=0;}
  process(output,outputRate) {
    const count=output[0]?.length||0;
    for(const channel of output)channel.fill(0);
    if(!this.active || !this.channels.length) return;
    const ratio=this.sampleRate/outputRate,length=this.channels[0].length;
    for(let index=0;index<count;index++) {
      this.age++;
      const target=this.age>outputRate*.09?0:this.targetRate;
      this.rate+=(target-this.rate)*.006;
      this.gain+=((Math.abs(target)>.015?Math.min(1,Math.abs(target)*3):0)-this.gain)*.008;
      const correction=Math.max(-.5,Math.min(.5,(this.goal-this.position)/3000));
      const step=(this.rate+correction)*ratio;
      this.position=Math.max(0,Math.min(length-2,this.position+step));this.goal+=this.rate*ratio;
      const base=Math.floor(this.position),fraction=this.position-base;
      if((this.position<=0 && step<0) || (this.position>=length-2 && step>0)) continue;
      for(let channel=0;channel<output.length;channel++) {
        const data=this.channels[Math.min(channel,this.channels.length-1)];
        output[channel][index]=((data[base]||0)*(1-fraction)+(data[base+1]||0)*fraction)*this.gain*.8;
      }
    }
  }
}
