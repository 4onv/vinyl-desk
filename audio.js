export const demos = [
  { title: 'Golden hour', artist: 'The Quiet Hours', cover: 'assets/cover-0.svg', url: 'assets/track-0.wav', color: '#d8814c' },
  { title: 'Quiet orbit', artist: 'The Quiet Hours', cover: 'assets/cover-1.svg', url: 'assets/track-1.wav', color: '#698d9a' },
  { title: 'After the rain', artist: 'The Quiet Hours', cover: 'assets/cover-2.svg', url: 'assets/track-2.wav', color: '#9280af' },
  { title: 'Scratch study', artist: 'Side A Originals', cover: 'assets/scratch-cover.svg', url: 'assets/scratch-study.wav', color: '#b96b46', bpm:96 },
];
export const formatTime = seconds => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
export const acceptsAudio = file => file.type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name);
export class AudioDeck extends EventTarget {
  constructor() {
    super(); this.tracks = [...demos]; this.index = 0; this.audio = new Audio();
    this.audio.preload = 'metadata'; this.audio.volume = .65; this.error = '';
    for (const name of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'volumechange', 'durationchange']) this.audio.addEventListener(name, () => this.notify(name));
    this.audio.addEventListener('error', () => { this.error = 'This audio file could not be played. Try an MP3, WAV, or OGG file.'; this.notify(); });
    this.audio.addEventListener('ended', () => this.load((this.index + 1) % this.tracks.length, true));
    this.audio.src = this.track.url;
  }
  get track() { return this.tracks[this.index]; }
  get playing() { return !this.audio.paused && !this.audio.ended; }
  notify(reason) { const event=new Event('change');event.reason=reason;this.dispatchEvent(event); }
  async play() {
    this.error = '';
    try { if (this.context?.state === 'suspended') await this.context.resume(); await this.audio.play(); }
    catch (error) { if (error.name !== 'AbortError') this.error = 'Playback could not start. Press play again or choose another track.'; this.notify(); }
  }
  toggle() { this.playing ? this.audio.pause() : this.play(); }
  load(index, play = false) {
    if (!this.tracks[index]) return;
    this.audio.pause(); this.index = index; this.error = ''; this.audio.src = this.track.url;
    this.notify(); if (play) this.play();
  }
  previous() { if (this.audio.currentTime > 3) this.audio.currentTime = 0; else this.load((this.index - 1 + this.tracks.length) % this.tracks.length, this.playing); }
  next() { this.load((this.index + 1) % this.tracks.length, this.playing); }
  seek(value) { if (Number.isFinite(this.audio.duration)) this.audio.currentTime = Math.max(0, Math.min(this.audio.duration, value)); }
  import(files) {
    const accepted = [...files].filter(acceptsAudio);
    if (!accepted.length) { this.error = 'Choose audio files such as MP3, WAV, or OGG.'; this.notify(); return 0; }
    const start = this.tracks.length;
    for (const file of accepted) this.tracks.push({ title: file.name.replace(/\.[^.]+$/, ''), artist: 'Your local collection', cover: 'assets/cover-1.svg', url: URL.createObjectURL(file), color: '#698d9a', local: true });
    this.load(start, true); return accepted.length;
  }
  analyse() {
    if (!this.context) {
      this.context = new AudioContext(); this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 128;
      this.source = this.context.createMediaElementSource(this.audio); this.source.connect(this.analyser); this.analyser.connect(this.context.destination);
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    }
    this.context.resume().catch(() => {});
  }
  energy() { if (!this.analyser || !this.playing) return 0; this.analyser.getByteFrequencyData(this.bins); return this.bins.reduce((a,b) => a+b,0) / (this.bins.length*255); }
  dispose() { this.audio.pause(); for (const t of this.tracks) if (t.local) URL.revokeObjectURL(t.url); this.context?.close(); }
}
