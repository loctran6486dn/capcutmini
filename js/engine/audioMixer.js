/**
 * CapCut Mini - Web Audio API Mixer
 */

class AudioMixer {
  constructor(state) {
    this.state = state;
    this.audioCtx = null;
    this.masterGain = null;
    this.previewGain = null;
    this.streamDestination = null;
    this.isExporting = false;

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

    // When clips are cut, split, or deleted: IMMEDIATELY silence all audio and clean up deleted elements
    this.state.on('tracks:changed', () => {
      this.pauseAll();
      const activeAudioClipKeys = new Set(this.state.tracks.audioTrack.clips.map(c => `audio_${c.id}`));
      this.audioElements.forEach((audio, key) => {
        if (key.startsWith('audio_') && !activeAudioClipKeys.has(key)) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          if (audio.parentNode) audio.parentNode.removeChild(audio);
          this.audioElements.delete(key);
        }
      });
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

  async ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
      this.masterGain = this.audioCtx.createGain();
      this.previewGain = this.audioCtx.createGain();
      this.streamDestination = this.audioCtx.createMediaStreamDestination();

      // previewGain routes audio to speakers during live preview
      this.masterGain.connect(this.previewGain);
      this.previewGain.connect(this.audioCtx.destination);

      // streamDestination routes 100% full unmuted audio to MediaRecorder stream
      this.masterGain.connect(this.streamDestination);
    }
    if (this.audioCtx.state === 'suspended') {
      try {
        const resumePromise = this.audioCtx.resume();
        const timeoutPromise = new Promise(r => setTimeout(r, 200));
        await Promise.race([resumePromise, timeoutPromise]);
      } catch (e) {
        console.warn('AudioContext resume failed:', e);
      }
    }
    return this.audioCtx;
  }

  getAudioElement(clipOrMediaId, trackType, mediaItemOverride = null) {
    const key = `${trackType}_${clipOrMediaId}`;
    if (this.audioElements.has(key)) {
      return this.audioElements.get(key);
    }

    let mediaItem = mediaItemOverride;
    if (!mediaItem) {
      mediaItem = this.state.getMedia(clipOrMediaId);
      if (!mediaItem) {
        const allClips = [
          ...this.state.tracks.videoTrack.clips,
          ...this.state.tracks.audioTrack.clips
        ];
        const clip = allClips.find(c => c.id === clipOrMediaId);
        if (clip) {
          mediaItem = this.state.getMedia(clip.mediaId);
        }
      }
    }
    if (!mediaItem) return null;

    const isVideo = mediaItem.type === 'video';
    // Use HTMLVideoElement for video containers to avoid MEDIA_ERR_SRC_NOT_SUPPORTED
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.src = mediaItem.url;
    if (!mediaItem.url.startsWith('blob:') && !mediaItem.url.startsWith('data:')) {
      el.crossOrigin = 'anonymous';
    }
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.muted = false;

    // Attach to DOM so browser background media engine keeps audio rendering active
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.left = '-9999px';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0.001';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '-999';
    document.body.appendChild(el);

    // Connect to Web Audio context
    this.ensureContext();
    try {
      const source = this.audioCtx.createMediaElementSource(el);
      const gainNode = this.audioCtx.createGain();
      source.connect(gainNode);
      gainNode.connect(this.masterGain);

      el._gainNode = gainNode;
    } catch (e) {
      console.warn('MediaElementSource connection error:', e);
    }

    this.audioElements.set(key, el);
    return el;
  }

  async prepareExport() {
    await this.ensureContext();
    this.isExporting = true;
    if (this.previewGain) {
      this.previewGain.gain.value = 0; // Mute preview speakers during export
    }

    // Pre-create and unlock all audio elements in user interaction context
    const allClips = [
      ...this.state.tracks.videoTrack.clips,
      ...this.state.tracks.audioTrack.clips
    ];

    for (const clip of allClips) {
      const mediaItem = this.state.getMedia(clip.mediaId);
      if (!mediaItem) continue;
      const type = (mediaItem.type === 'video') ? 'video' : 'audio';
      const el = this.getAudioElement(clip.id, type, mediaItem);
      if (el) {
        el.playbackRate = clip.speed || 1.0;
        el.currentTime = clip.trimStart || 0;
        const vol = clip.volume !== undefined ? clip.volume : 1.0;
        if (el._gainNode) el._gainNode.gain.value = vol;

        try {
          const p = el.play();
          if (p !== undefined) {
            p.then(() => {
              if (!this.state.isPlaying && !this.isExporting) {
                el.pause();
              }
            }).catch(() => {});
          }
        } catch (e) {}
      }
    }
  }

  finishExport() {
    this.isExporting = false;
    this.pauseAll();
    if (this.previewGain) {
      this.previewGain.gain.value = 1; // Restore preview speakers
    }
    // Clean up temporary export video audio elements to avoid leaking DOM nodes and decoders
    this.audioElements.forEach((audio, key) => {
      if (key.startsWith('video_')) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        if (audio.parentNode) audio.parentNode.removeChild(audio);
        this.audioElements.delete(key);
      }
    });
  }

  syncPlayback(isPlaying, explicitTime = null) {
    const time = (explicitTime !== null && explicitTime !== undefined) ? explicitTime : this.state.currentTime;

    // 1. Sync Audio Track Clips (BGM)
    const audioClips = this.state.tracks.audioTrack.clips;
    const activeAudioClip = audioClips.find(
      c => time >= c.startTime && time < (c.startTime + c.duration)
    );
    const activeAudioEl = activeAudioClip ? this.getAudioElement(activeAudioClip.id, 'audio') : null;

    // Pause non-active BGM audios
    this.audioElements.forEach((audio, key) => {
      if (key.startsWith('audio_') && audio !== activeAudioEl && !audio.paused) {
        audio.pause();
      }
    });

    if (activeAudioClip && activeAudioEl) {
      const clipSpeed = activeAudioClip.speed || 1.0;
      const targetMediaTime = (activeAudioClip.trimStart || 0) + (time - activeAudioClip.startTime) * clipSpeed;

      if (this.lastActiveAudioClipId !== activeAudioClip.id) {
        this.lastActiveAudioClipId = activeAudioClip.id;
        this._audioPlayStartTime = performance.now();
        activeAudioEl.currentTime = targetMediaTime;
        activeAudioEl.playbackRate = clipSpeed;
      } else {
        const now = performance.now();
        const timeSinceStart = this._audioPlayStartTime ? (now - this._audioPlayStartTime) : 1000;
        const drift = activeAudioEl.currentTime - targetMediaTime;
        const absDrift = Math.abs(drift);
        const hardSeekThreshold = Math.max(0.65, 0.45 * clipSpeed);

        if (absDrift > hardSeekThreshold && timeSinceStart >= 500) {
          if (!activeAudioEl.seeking) {
            activeAudioEl.currentTime = targetMediaTime;
          }
        } else if (absDrift > 0.08 && timeSinceStart >= 300) {
          const desiredRate = (drift < 0) ? (clipSpeed * 1.05) : (clipSpeed * 0.95);
          if (Math.abs(activeAudioEl.playbackRate - desiredRate) > 0.02) {
            activeAudioEl.playbackRate = desiredRate;
          }
        } else {
          if (activeAudioEl.playbackRate !== clipSpeed) {
            activeAudioEl.playbackRate = clipSpeed;
          }
        }
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

    // 2. Sync Video Track Sound ONLY during project export
    // During live preview, CanvasRenderer ping-pong players output audio directly
    if (this.isExporting) {
      const videoClips = this.state.tracks.videoTrack.clips;
      const activeVideoClip = videoClips.find(
        c => time >= c.startTime && time < (c.startTime + c.duration)
      );
      const activeVideoAudioEl = (activeVideoClip && this.state.getMedia(activeVideoClip.mediaId)?.type === 'video')
        ? this.getAudioElement(activeVideoClip.id, 'video')
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
          this._videoAudioPlayStartTime = performance.now();
          activeVideoAudioEl.currentTime = targetMediaTime;
          activeVideoAudioEl.playbackRate = clipSpeed;
        } else {
          const now = performance.now();
          const timeSinceStart = this._videoAudioPlayStartTime ? (now - this._videoAudioPlayStartTime) : 1000;
          const drift = activeVideoAudioEl.currentTime - targetMediaTime;
          const absDrift = Math.abs(drift);
          const hardSeekThreshold = Math.max(0.65, 0.45 * clipSpeed);

          if (absDrift > hardSeekThreshold && timeSinceStart >= 500) {
            if (!activeVideoAudioEl.seeking) {
              activeVideoAudioEl.currentTime = targetMediaTime;
            }
          } else if (absDrift > 0.08 && timeSinceStart >= 300) {
            const desiredRate = (drift < 0) ? (clipSpeed * 1.05) : (clipSpeed * 0.95);
            if (Math.abs(activeVideoAudioEl.playbackRate - desiredRate) > 0.02) {
              activeVideoAudioEl.playbackRate = desiredRate;
            }
          } else {
            if (activeVideoAudioEl.playbackRate !== clipSpeed) {
              activeVideoAudioEl.playbackRate = clipSpeed;
            }
          }
        }

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
    } else {
      // Live preview: ensure any export audio elements are silenced
      this.audioElements.forEach((audio, key) => {
        if (key.startsWith('video_') && !audio.paused) {
          audio.pause();
        }
      });
      this.lastActiveVideoAudioClipId = null;
    }
  }

  getAudioDestinationStream() {
    this.ensureContext();
    return this.streamDestination ? this.streamDestination.stream : null;
  }
}

window.AudioMixer = AudioMixer;
