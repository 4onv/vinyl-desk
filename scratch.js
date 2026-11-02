export class ScratchEngine {
  async prepare(track) {
    if(!track?.url || !(track.url.startsWith('assets/') || track.local && track.url.startsWith('blob:'))) throw new Error('Scratch audio is available for local and demo records. Spotify records use seek instead.');
    if(!this.initializing) this.initializing=(async()=>{
      this.context=new AudioContext({latencyHint:'interactive'});
      try {
        await this.context.resume();await this.context.audioWorklet.addModule(new URL('./scratch-processor.js',import.meta.url));
        this.node=new AudioWorkletNode(this.context,'side-a-scratch',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        this.gain=this.context.createGain();this.node.connect(this.gain);this.gain.connect(this.context.destination);
      } catch(error) {await this.context.close();this.context=null;this.initializing=null;throw error;}
    })();
    await this.initializing;
    await this.context.resume();
    if(this.loaded===track.url) return;
    if(this.loading?.url===track.url) return this.loading.promise;
    const generation=(this.generation||0)+1;this.generation=generation;
    const promise=(async()=>{
      const response=await fetch(track.url);if(!response.ok)throw new Error('This record could not be prepared for scratching.');
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength>32*1024*1024) throw new Error('This file is too large for scratch mode. Dragging still seeks through it.');
      const buffer=await this.context.decodeAudioData(bytes);
      if(buffer.length*buffer.numberOfChannels>24000000) throw new Error('This record needs too much scratch memory. Dragging still seeks through it.');
      if(generation!==this.generation) return;
      const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,index)=>buffer.getChannelData(index).slice());
      this.node.port.postMessage({type:'load',channels,sampleRate:buffer.sampleRate},channels.map(channel=>channel.buffer));
      this.loaded=track.url;
    })();
    this.loading={url:track.url,promise};
    try {await promise;}finally{if(this.loading?.promise===promise)this.loading=null;}
  }
  start(position,volume) {if(this.node){this.gain.gain.value=volume;this.node.port.postMessage({type:'start',position});}}
  move(position,rate) {this.node?.port.postMessage({type:'move',position,rate});}
  stop() {this.node?.port.postMessage({type:'stop'});}
  release() {this.generation=(this.generation||0)+1;this.loaded=null;this.node?.port.postMessage({type:'release'});this.context?.suspend().catch(()=>{});}
  dispose() {this.release();this.node?.disconnect();this.context?.close();}
}
