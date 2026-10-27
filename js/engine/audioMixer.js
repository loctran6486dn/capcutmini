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
      this.pauseAll();
      this.syncPlayback(false);
    });

    this.state.on('seek', () => {
      this.syncPlayback(this.state.isPlaying);
    });

    this.state.on('timeupdate', () => {
      if (this.state.isPlaying) {
        this.syncPlayback(true);
      }
    });

    // When clips are cut, split, or deleted: IMMEDIATELY silence all audio and re-sync
    this.state.on('tracks:changed', () => {
      this.pauseAll();
      this.syncPlayback(this.state.isPlaying);
    });
  }

  pauseAll() {
    this.audioElements.forEach((audio) => {
      if (!audio.paused) {
        audio.pause();
      }
    });
    this.lastActiveAudioClipId = null;
    this.lastActiveVideoAudioClipId = null;
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
    const activeAudioClip = audioClips.find(
      c => time >= c.startTime && time < (c.startTime + c.duration)
    );
    const activeAudioEl = activeAudioClip ? this.getAudioElement(activeAudioClip.mediaId, 'audio') : null;

    // Pause non-active BGM audios
    this.audioElements.forEach((audio, key) => {
      if (key.startsWith('audio_') && audio !== activeAudioEl && !audio.paused) {
        audio.pause();
      }
    });

    if (activeAudioClip && activeAudioEl) {
      const targetMediaTime = (activeAudioClip.trimStart || 0) + (time - activeAudioClip.startTime);
      if (this.lastActiveAudioClipId !== activeAudioClip.id) {
        this.lastActiveAudioClipId = activeAudioClip.id;
        activeAudioEl.currentTime = targetMediaTime;
      } else if (Math.abs(activeAudioEl.currentTime - targetMediaTime) > 0.25) {
        activeAudioEl.currentTime = targetMediaTime;
      }

      const vol = activeAudioClip.volume !== undefined ? activeAudioClip.volume : 1.0;
      if (activeAudioEl._gainNode) {
        activeAudioEl._gainNode.gain.value = vol;
      } else {
        activeAudioEl.volume = vol;
      }

      if (isPlaying) {
        if (activeAudioEl.paused) {
          activeAudioEl.play().catch(() => {});
        }
      } else {
        if (!activeAudioEl.paused) {
          activeAudioEl.pause();
        }
      }
    } else {
      this.lastActiveAudioClipId = null;
    }

    // 2. Sync Video Track Sound
    const videoClips = this.state.tracks.videoTrack.clips;
    const activeVideoClip = videoClips.find(
      c => time >= c.startTime && time < (c.startTime + c.duration)
    );
    const activeVideoAudioEl = (activeVideoClip && this.state.getMedia(activeVideoClip.mediaId)?.type === 'video')
      ? this.getAudioElement(activeVideoClip.mediaId, 'video')
      : null;

    // Pause non-active video sound audios
    this.audioElements.forEach((audio, key) => {
      if (key.startsWith('video_') && audio !== activeVideoAudioEl && !audio.paused) {
        audio.pause();
      }
    });

    if (activeVideoClip && activeVideoAudioEl) {
      const clipSpeed = activeVideoClip.speed || 1.0;
      const targetMediaTime = (activeVideoClip.trimStart || 0) + (time - activeVideoClip.startTime) * clipSpeed;

      if (this.lastActiveVideoAudioClipId !== activeVideoClip.id) {
        this.lastActiveVideoAudioClipId = activeVideoClip.id;
        activeVideoAudioEl.currentTime = targetMediaTime;
      } else if (Math.abs(activeVideoAudioEl.currentTime - targetMediaTime) > 0.25) {
        activeVideoAudioEl.currentTime = targetMediaTime;
      }

      activeVideoAudioEl.playbackRate = clipSpeed;
      const vol = activeVideoClip.volume !== undefined ? activeVideoClip.volume : 1.0;
      if (activeVideoAudioEl._gainNode) {
        activeVideoAudioEl._gainNode.gain.value = vol;
      } else {
        activeVideoAudioEl.volume = vol;
      }

      if (isPlaying) {
        if (activeVideoAudioEl.paused) {
          activeVideoAudioEl.play().catch(() => {});
        }
      } else {
        if (!activeVideoAudioEl.paused) {
          activeVideoAudioEl.pause();
        }
      }
    } else {
      this.lastActiveVideoAudioClipId = null;
    }
  }

  getAudioDestinationStream() {
    this.ensureContext();
    return this.streamDestination ? this.streamDestination.stream : null;
  }
}

window.AudioMixer = AudioMixer;
