export const angleDelta = (previous,next) => ((next-previous+540)%360)-180;
export const scrubPosition = (start,degrees,duration,secondsPerTurn=1.8) => Math.max(0,Math.min(Math.max(0,duration-.05),start+degrees/360*secondsPerTurn));
export class TapTempo {
  constructor() {this.reset();}
  reset() {this.taps=[];this.bpm=null;}
  tap(time) {
    const last=this.taps.at(-1);
    if(last!==undefined && (time-last>2200 || time<=last)) this.reset();
    else if(last!==undefined && time-last<160) return this.bpm;
    this.taps.push(time);this.taps=this.taps.slice(-9);
    if(this.taps.length<4) return null;
    const gaps=this.taps.slice(1).map((t,i)=>t-this.taps[i]).sort((a,b)=>a-b);
    const middle=Math.floor(gaps.length/2),median=gaps.length%2?gaps[middle]:(gaps[middle-1]+gaps[middle])/2;
    this.bpm=Math.round(60000/median);return this.bpm;
  }
}
export class Platter {
  constructor(element,{state,onStart,onMove,onEnd,onError}) {
    Object.assign(this,{element,state,onStart,onMove,onEnd,onError});
    element.addEventListener('pointerdown',event=>this.start(event));
    element.addEventListener('pointermove',event=>this.move(event));
    element.addEventListener('pointerup',()=>this.finish(true));
    element.addEventListener('pointercancel',()=>this.finish(false));
    element.addEventListener('lostpointercapture',()=>this.finish(false));
    element.addEventListener('keydown',event=>{
      const state=this.state();if(!state.canSeek || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();event.stopPropagation();
      const position=event.key==='Home'?0:event.key==='End'?state.duration-.1:state.position+(event.key==='ArrowLeft'?-5:5);
      Promise.resolve(this.onEnd(Math.max(0,Math.min(state.duration-.05,position)),null)).catch(this.onError);
    });
  }
  start(event) {
    if(this.drag || event.button!==0) return;
    const state=this.state();if(!state.canSeek || !state.duration) return;
    event.preventDefault();
    const rect=this.element.getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    const matrix=new DOMMatrixReadOnly(getComputedStyle(this.element).transform);
    const rotation=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
    this.drag={...state,center,pointer:event.pointerId,start:state.position,degrees:0,rotation,
      angle:Math.atan2(event.clientY-center.y,event.clientX-center.x)*180/Math.PI,lastTime:event.timeStamp,position:state.position};
    this.element.setPointerCapture(event.pointerId);this.element.focus({preventScroll:true});
    this.element.style.animation='none';this.element.style.transform=`rotate(${rotation}deg)`;
    document.body.classList.add('scrubbing');
    Promise.resolve(this.onStart(this.drag)).catch(this.onError);
  }
  move(event) {
    const drag=this.drag;if(!drag || event.pointerId!==drag.pointer) return;
    const angle=Math.atan2(event.clientY-drag.center.y,event.clientX-drag.center.x)*180/Math.PI;
    const delta=angleDelta(drag.angle,angle),elapsed=Math.max(8,event.timeStamp-drag.lastTime);
    drag.degrees+=delta;drag.angle=angle;drag.lastTime=event.timeStamp;
    drag.position=scrubPosition(drag.start,drag.degrees,drag.duration);
    this.element.style.transform=`rotate(${drag.rotation+drag.degrees}deg)`;
    this.onMove(drag.position,Math.max(-6,Math.min(6,delta/360*1.8/(elapsed/1000))),drag);
  }
  finish(commit) {
    const drag=this.drag;if(!drag) return;
    this.drag=null;
    if(this.element.hasPointerCapture(drag.pointer)) this.element.releasePointerCapture(drag.pointer);
    this.element.style.setProperty('--rotation-start',(drag.rotation+drag.degrees)+'deg');
    this.element.style.removeProperty('animation');this.element.style.removeProperty('transform');
    document.body.classList.remove('scrubbing');
    Promise.resolve(this.onEnd(commit?drag.position:drag.start,drag)).catch(this.onError);
  }
  cancel() {this.finish(false);}
  update(state) {
    this.element.setAttribute('aria-disabled',String(!state.canSeek));
    this.element.setAttribute('aria-valuemax',String(Math.round(state.duration||0)));
    if(!this.drag)this.element.setAttribute('aria-valuenow',String(Math.round(state.position||0)));
  }
}
