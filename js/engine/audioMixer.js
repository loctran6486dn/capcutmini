/**
 * CapCut Mini - Web Audio API Mixer
 */

class AudioMixer {
  constructor(state) {
    this.state = state;
    this.audioCtx = null;
    this.masterGain = null;
    this.streamDestination = null;

    // Cache of audio elements
    this.audioElements = new Map();
    this.mediaSources = new Map();

    this.init();
  }

  init() {
    this.state.on('playback:play', () => {
      this.ensureContext();
      this.syncPlayback(true);
    });

    this.state.on('playback:pause', () => {
      this.syncPlayback(false);
    });

    this.state.on('seek', () => {
      this.syncPlayback(this.state.isPlaying);
    });
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.masterGain = this.audioCtx.createGain();
      this.streamDestination = this.audioCtx.createMediaStreamDestination();

      this.masterGain.connect(this.audioCtx.destination);
      this.masterGain.connect(this.streamDestination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  getAudioElement(mediaId, trackType) {
    const key = `${trackType}_${mediaId}`;
    if (this.audioElements.has(key)) {
      return this.audioElements.get(key);
    }

    const mediaItem = this.state.getMedia(mediaId);
    if (!mediaItem) return null;

    const audio = new Audio();
    audio.src = mediaItem.url;
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';

    // Connect to Web Audio context
    this.ensureContext();
    try {
      const source = this.audioCtx.createMediaElementSource(audio);
      const gainNode = this.audioCtx.createGain();
      source.connect(gainNode);
      gainNode.connect(this.masterGain);

      audio._gainNode = gainNode;
    } catch (e) {
      console.warn('MediaElementSource error (could be cross-origin):', e);
    }

    this.audioElements.set(key, audio);
    return audio;
  }

  syncPlayback(isPlaying) {
    const time = this.state.currentTime;

    // 1. Sync Audio Track Clips (BGM)
    const audioClips = this.state.tracks.audioTrack.clips;
    audioClips.forEach(clip => {
      const audio = this.getAudioElement(clip.mediaId, 'audio');
      if (!audio) return;

      const isInside = time >= clip.startTime && time < (clip.startTime + clip.duration);
      if (isInside) {
        const targetMediaTime = clip.trimStart + (time - clip.startTime);
        if (Math.abs(audio.currentTime - targetMediaTime) > 0.2) {
          audio.currentTime = targetMediaTime;
        }
        if (audio._gainNode) {
          audio._gainNode.gain.value = clip.volume !== undefined ? clip.volume : 1.0;
        } else {
          audio.volume = clip.volume !== undefined ? clip.volume : 1.0;
        }

        if (isPlaying && audio.paused) {
          audio.play().catch(() => {});
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });

    // 2. Sync Video Sound
    const videoClips = this.state.tracks.videoTrack.clips;
    videoClips.forEach(clip => {
      // If video has sound, manage its audio element
      const mediaItem = this.state.getMedia(clip.mediaId);
      if (!mediaItem || mediaItem.type !== 'video') return;

      const audio = this.getAudioElement(clip.mediaId, 'video');
      if (!audio) return;

      const isInside = time >= clip.startTime && time < (clip.startTime + clip.duration);
      if (isInside) {
        const targetMediaTime = clip.trimStart + (time - clip.startTime) * (clip.speed || 1.0);
        if (Math.abs(audio.currentTime - targetMediaTime) > 0.2) {
          audio.currentTime = targetMediaTime;
        }
        audio.playbackRate = clip.speed || 1.0;
        const vol = clip.volume !== undefined ? clip.volume : 1.0;
        if (audio._gainNode) {
          audio._gainNode.gain.value = vol;
        } else {
          audio.volume = vol;
        }

        if (isPlaying && audio.paused) {
          audio.play().catch(() => {});
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }

  getAudioDestinationStream() {
    this.ensureContext();
    return this.streamDestination ? this.streamDestination.stream : null;
  }
}

window.AudioMixer = AudioMixer;
