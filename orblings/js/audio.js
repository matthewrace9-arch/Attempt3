/* Procedural Web Audio: every sound is synthesised, so there are no asset
 * downloads and no licensing concerns. Includes a soft generative music loop. */
(function () {
  const OB = (window.OB = window.OB || {});

  // C major pentatonic across a few octaves — every combo note sounds good
  const PENTA = [0, 2, 4, 7, 9];
  const noteFreq = (semi) => 261.63 * Math.pow(2, semi / 12);
  const pentaNote = (step) => {
    const oct = Math.floor(step / 5);
    return noteFreq(PENTA[((step % 5) + 5) % 5] + oct * 12);
  };

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.sfxOn = true;
      this.musicOn = true;
      this.lastPickup = 0;
      this.musicTimer = null;
      this.musicStep = 0;
      this.nextNoteTime = 0;
      this.intensity = 0; // 0 menu .. 1 action
      this.noiseBuf = null;
    }

    /** must be called from a user gesture (iOS/Android autoplay rules) */
    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.8;
          this.master.connect(this.ctx.destination);
          this.sfx = this.ctx.createGain();
          this.sfx.gain.value = this.sfxOn ? 0.55 : 0;
          this.sfx.connect(this.master);
          this.music = this.ctx.createGain();
          this.music.gain.value = this.musicOn ? 0.22 : 0;
          this.musicFilter = this.ctx.createBiquadFilter();
          this.musicFilter.type = 'lowpass';
          this.musicFilter.frequency.value = 1400;
          this.musicFilter.connect(this.music);
          this.music.connect(this.master);
          const len = this.ctx.sampleRate * 0.5;
          this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const data = this.noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
          this.startMusic();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) {
        this.ctx = null;
      }
    }

    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    }
    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    setSfx(on) {
      this.sfxOn = on;
      if (this.sfx) this.sfx.gain.value = on ? 0.55 : 0;
    }
    setMusic(on) {
      this.musicOn = on;
      if (this.music) this.music.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.1);
    }

    // ------------------------------------------------------------ primitives
    tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0, dest = null) {
      if (!this.ctx || (!this.sfxOn && !dest)) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(dest || this.sfx);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    noise(dur, freq = 1200, vol = 0.25, freqTo = null, delay = 0, q = 1) {
      if (!this.ctx || !this.sfxOn) return;
      const t = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, t);
      if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfx);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    // ------------------------------------------------------------ sfx
    pickup(combo, gold) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (now - this.lastPickup < 0.035) return; // rate-limit
      this.lastPickup = now;
      const f = pentaNote(5 + Math.min(combo, 14));
      this.tone(f, 0.09, 'sine', 0.16);
      if (gold) { this.tone(f * 1.5, 0.18, 'triangle', 0.18, null, 0.04); this.tone(f * 2, 0.22, 'sine', 0.12, null, 0.09); }
    }
    eat() {
      this.tone(180, 0.25, 'sine', 0.5, 50);
      this.tone(pentaNote(10), 0.18, 'triangle', 0.22, null, 0.05);
      this.tone(pentaNote(12), 0.25, 'triangle', 0.2, null, 0.11);
    }
    hitDealt() {
      this.tone(760, 0.09, 'triangle', 0.25, 380);
      this.noise(0.06, 3000, 0.12);
    }
    hurt() {
      this.tone(220, 0.22, 'square', 0.18, 70);
      this.noise(0.15, 600, 0.25, 200);
    }
    clash() {
      this.noise(0.08, 4200, 0.18, 2000, 0, 3);
      this.tone(1200, 0.05, 'square', 0.06, 900);
    }
    pulse() {
      this.noise(0.4, 300, 0.35, 2400, 0, 0.8);
      this.tone(140, 0.35, 'sine', 0.35, 520);
    }
    moonGain() {
      this.tone(pentaNote(8), 0.12, 'sine', 0.2);
      this.tone(pentaNote(10), 0.2, 'sine', 0.18, null, 0.07);
    }
    death() {
      this.tone(440, 0.8, 'sawtooth', 0.18, 55);
      this.noise(0.6, 800, 0.3, 120);
    }
    levelUp() {
      [0, 2, 4, 5, 7].forEach((s, i) => this.tone(pentaNote(10 + s), 0.25, 'triangle', 0.2, null, i * 0.07));
    }
    achievement() {
      [0, 4, 7, 10].forEach((s, i) => this.tone(pentaNote(12 + s), 0.3, 'sine', 0.18, null, i * 0.09));
    }
    click() {
      this.tone(900, 0.04, 'sine', 0.12, 1300);
    }
    countUp() {
      this.tone(pentaNote(12 + Math.floor(Math.random() * 4)), 0.05, 'sine', 0.06);
    }

    // ------------------------------------------------------------ music
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      const bpm = 104;
      const step = 60 / bpm / 2; // eighth notes
      const chords = [
        [0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2],
      ];
      this.musicTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running') return;
        while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
          const s = this.musicStep++;
          const bar = Math.floor(s / 8) % chords.length;
          const chord = chords[bar];
          const t = this.nextNoteTime - this.ctx.currentTime;
          if (s % 8 === 0) {
            // bass
            this.tone(noteFreq(chord[0] - 24), step * 7.5, 'triangle', 0.35, null, t, this.musicFilter);
            this.tone(noteFreq(chord[1] - 12), step * 7.5, 'sine', 0.08, null, t, this.musicFilter);
          }
          // arpeggio thickens with intensity
          const pattern = [0, 1, 2, 1, 2, 0, 2, 1];
          if (this.intensity > 0.3 || s % 2 === 0) {
            const n = chord[pattern[s % 8]] + 12 + (s % 16 >= 8 ? 12 : 0);
            this.tone(noteFreq(n), step * 1.6, 'sine', 0.06 + this.intensity * 0.05, null, t, this.musicFilter);
          }
          if (this.intensity > 0.5 && s % 4 === 2) {
            // soft hat
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuf;
            const f = this.ctx.createBiquadFilter();
            f.type = 'highpass'; f.frequency.value = 7000;
            const g = this.ctx.createGain();
            const tt = this.nextNoteTime;
            g.gain.setValueAtTime(0.05, tt);
            g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.05);
            src.connect(f); f.connect(g); g.connect(this.music);
            src.start(tt); src.stop(tt + 0.06);
          }
          this.nextNoteTime += step;
        }
      }, 60);
    }
  }

  OB.Audio = new AudioEngine();
})();
