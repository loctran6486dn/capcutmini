/**
 * CapCut Mini - Real-time Canvas Composite Renderer
 */

class CanvasRenderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = state;
    this.animationFrameId = null;
    this.lastRenderTime = 0;

    // Cache of HTMLVideoElements / HTMLImageElements (visual only, permanently muted)
    this.mediaElements = new Map();

    // Dual Ping-Pong audio players for 0-latency seamless clip transitions on iOS Safari & Desktop
    this.initAudioPlayer();

    this.init();
    this.setupGlobalUnlock();
  }

  initAudioPlayer() {
    const createPlayer = (id) => {
      const p = document.createElement('video');
      p.id = id;
      p.playsInline = true;
      p.setAttribute('playsinline', '');
      p.setAttribute('webkit-playsinline', '');
      p.muted = false;
      p.preload = 'auto';

      // Must be in DOM with slight opacity to ensure iOS WebKit treats it as an active media pipeline
      p.style.position = 'fixed';
      p.style.top = '-9999px';
      p.style.left = '-9999px';
      p.style.width = '1px';
      p.style.height = '1px';
      p.style.opacity = '0.01';
      p.style.pointerEvents = 'none';
      p.style.zIndex = '-999';

      // Seed with a tiny valid silent WAV data URI so initial user gesture unlocks it cleanly with 0 errors
      p.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A';
      document.body.appendChild(p);
      return p;
    };

    this.audioPlayerA = createPlayer('capcut-audio-player-a');
    this.audioPlayerB = createPlayer('capcut-audio-player-b');
    this.activeAudioPlayer = this.audioPlayerA;
    this.standbyAudioPlayer = this.audioPlayerB;

    this.audioPlayersUnlocked = false;
    this._currentAudioClipId = null;
    this._prewarmedClipId = null;
    this._prewarmingVideoEl = null;
  }

  setupGlobalUnlock() {
    this._hasUserInteracted = false;
    const unlockHandler = () => {
      this.unlockAudioPlayer();
    };
    window.addEventListener('touchstart', unlockHandler, { passive: true, capture: true });
    window.addEventListener('pointerdown', unlockHandler, { passive: true, capture: true });
    window.addEventListener('click', unlockHandler, { passive: true, capture: true });
  }

  unlockAudioPlayer() {
    this._hasUserInteracted = true;
    if (!this.audioPlayersUnlocked) {
      const unlockP = (player) => {
        if (!player) return;
        const p = player.play();
        if (p !== undefined) {
          p.then(() => {
            if (!this.state.isPlaying) player.pause();
          }).catch(() => {});
        }
      };
      unlockP(this.audioPlayerA);
      unlockP(this.audioPlayerB);
      this.audioPlayersUnlocked = true;
    }
  }

  init() {
    this.updateCanvasDimensions();

    this.state.on('project:changed', () => {
      this.updateCanvasDimensions();
      this.renderCurrentFrame();
    });

    this.state.on('seek', () => {
      this._prewarmedClipId = null;
      this._prewarmingVideoEl = null;
      if (this.audioPlayerA && !this.audioPlayerA.paused) this.audioPlayerA.pause();
      if (this.audioPlayerB && !this.audioPlayerB.paused) this.audioPlayerB.pause();
      this.renderCurrentFrame();
    });

    this.state.on('tracks:changed', () => {
      this.lastActiveClipId = null;
      this._currentAudioClipId = null;
      this._prewarmedClipId = null;
      this._prewarmingVideoEl = null;
      this.mediaElements.forEach(el => {
        el._lastRequestedSeekTime = null;
      });
      this.syncActiveVideos(this.state.isPlaying);
      this.renderCurrentFrame();
    });

    this.state.on('playback:play', () => {
      this.unlockAudioPlayer();
      this.startLoop();
    });

    this.state.on('playback:pause', () => {
      this.stopLoop();
      this.syncActiveVideos(false);
    });
  }

  updateCanvasDimensions() {
    this.canvas.width = this.state.project.width;
    this.canvas.height = this.state.project.height;
  }

  getMediaElement(mediaId, secondary = false) {
    if (!mediaId) return null;
    const key = secondary ? `${mediaId}__sec` : mediaId;
    if (this.mediaElements.has(key)) {
      return this.mediaElements.get(key);
    }
    const mediaItem = this.state.getMedia(mediaId);
    if (!mediaItem) return null;

    if (mediaItem.type === 'video') {
      const video = document.createElement('video');
      video.src = mediaItem.url;
      video.crossOrigin = 'anonymous';
      video.muted = true; // Permanently muted for visual frame rendering (never blocked by iOS Safari)
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.preload = 'auto';
      video.addEventListener('seeked', () => {
        if (!this.state.isPlaying) {
          this.drawFrameImmediate(this.state.currentTime);
        }
      });
      this.mediaElements.set(key, video);
      return video;
    } else if (mediaItem.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.renderCurrentFrame();
      };
      img.src = mediaItem.url;
      this.mediaElements.set(key, img);
      return img;
    }
    return null;
  }

  startLoop() {
    this.lastTimestamp = performance.now();
    const loop = (timestamp) => {
      if (!this.state.isPlaying) return;

      const elapsed = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;

      // Cap delta time to prevent large jumps (e.g. after tab blur)
      const clampedElapsed = Math.min(elapsed, 0.1);
      const newTime = this.state.currentTime + clampedElapsed;

      if (newTime >= this.state.duration) {
        this.state.seek(this.state.duration);
        this.state.pause();
        this.renderCurrentFrame();
        return;
      }

      this.state.seek(newTime, { emit: false });
      this.state.emit('timeupdate', newTime);

      // Sync active videos BEFORE drawing current frame
      this.syncActiveVideos(true);
      this.renderCurrentFrame();

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.lastActiveClipId = null;
    this._currentAudioClipId = null;
    this._prewarmedClipId = null;
    this._prewarmingVideoEl = null;
    if (this.audioPlayerA && !this.audioPlayerA.paused) this.audioPlayerA.pause();
    if (this.audioPlayerB && !this.audioPlayerB.paused) this.audioPlayerB.pause();
  }

  syncActiveVideos(isPlaying) {
    const time = this.state.currentTime;
    const videoClips = this.state.tracks.videoTrack.clips;

    // Identify the active clip at current timestamp
    let activeIndex = -1;
    for (let i = 0; i < videoClips.length; i++) {
      const c = videoClips[i];
      if (time >= c.startTime && time < (c.startTime + c.duration)) {
        activeIndex = i;
        break;
      }
    }
    // Safeguard boundary: if exactly at end of timeline, keep the last clip active
    if (activeIndex === -1 && videoClips.length > 0 && time >= this.state.duration - 0.05) {
      activeIndex = videoClips.length - 1;
    }

    const activeClip = activeIndex >= 0 ? videoClips[activeIndex] : null;
    const nextClip = (activeIndex >= 0 && activeIndex + 1 < videoClips.length) ? videoClips[activeIndex + 1] : null;

    // Use secondary element for consecutive clips with the same mediaId to eliminate cut seeking freeze
    const prevClip = activeIndex > 0 ? videoClips[activeIndex - 1] : null;
    const isConsecutiveSameMedia = prevClip && activeClip && prevClip.mediaId === activeClip.mediaId;
    const useSecondary = isConsecutiveSameMedia && (activeIndex % 2 === 1);
    const activeEl = activeClip ? this.getMediaElement(activeClip.mediaId, useSecondary) : null;
    this.currentActiveEl = activeEl;

    // 1. Pause any visual video element that is NOT currently active and NOT pre-warming
    this.mediaElements.forEach((el) => {
      if (el.tagName === 'VIDEO' && el !== activeEl && el !== this._prewarmingVideoEl && !el.paused) {
        el.pause();
      }
    });

    // 2. Control active visual video element (always muted, 0 iOS restrictions)
    if (activeClip && activeEl && activeEl.tagName === 'VIDEO') {
      const clipSpeed = activeClip.speed || 1.0;
      const targetMediaTime = (activeClip.trimStart || 0) + (time - activeClip.startTime) * clipSpeed;

      activeEl.muted = true; // Visual element is always muted

      // When crossing between cut/split clips, jump to target time if not already at it
      if (this.lastActiveClipId !== activeClip.id) {
        this.lastActiveClipId = activeClip.id;
        if (Math.abs(activeEl.currentTime - targetMediaTime) > 0.05) {
          activeEl.currentTime = targetMediaTime;
        }
      } else {
        // Continuous playback within same clip: only sync if drift is substantial (> 0.25s)
        if (Math.abs(activeEl.currentTime - targetMediaTime) > 0.25) {
          activeEl.currentTime = targetMediaTime;
        }
      }

      if (activeEl.playbackRate !== clipSpeed) {
        activeEl.playbackRate = clipSpeed;
      }

      if (isPlaying) {
        if (activeEl.paused) {
          activeEl.play().catch(() => {});
        }
      } else {
        if (!activeEl.paused) {
          activeEl.pause();
        }
      }
    } else {
      this.lastActiveClipId = null;
    }

    // 3. Dual Ping-Pong Audio Sync (0-latency seamless transitions)
    this.syncAudioPlayerPingPong(activeClip, isPlaying, time);

    // 4. Lookahead Pre-warming (0.8s prior to transition point)
    if (isPlaying && activeClip && nextClip) {
      const timeRemaining = (activeClip.startTime + activeClip.duration) - time;
      if (timeRemaining <= 0.8) {
        this.prewarmNextClip(nextClip, activeIndex + 1);
      }
    }
  }

  syncAudioPlayerPingPong(activeClip, isPlaying, time) {
    if (!this.activeAudioPlayer) return;

    if (!isPlaying || !activeClip) {
      if (this.audioPlayerA && !this.audioPlayerA.paused) this.audioPlayerA.pause();
      if (this.audioPlayerB && !this.audioPlayerB.paused) this.audioPlayerB.pause();
      this._currentAudioClipId = null;
      return;
    }

    const mediaItem = this.state.getMedia(activeClip.mediaId);
    if (!mediaItem || mediaItem.type !== 'video') {
      if (this.audioPlayerA && !this.audioPlayerA.paused) this.audioPlayerA.pause();
      if (this.audioPlayerB && !this.audioPlayerB.paused) this.audioPlayerB.pause();
      this._currentAudioClipId = null;
      return;
    }

    const clipSpeed = activeClip.speed || 1.0;
    const targetMediaTime = (activeClip.trimStart || 0) + (time - activeClip.startTime) * clipSpeed;
    const clipVol = activeClip.volume !== undefined ? activeClip.volume : 1.0;
    const vol = Math.max(0, Math.min(1, clipVol));

    // TRANSITION: Clip changed!
    if (this._currentAudioClipId !== activeClip.id) {
      this._currentAudioClipId = activeClip.id;

      // Check if standby player was already pre-warmed for this exact clip!
      if (this._prewarmedClipId === activeClip.id && this.standbyAudioPlayer) {
        // PING-PONG SWAP: Standby player is ALREADY HOT and READY!
        const oldPlayer = this.activeAudioPlayer;
        this.activeAudioPlayer = this.standbyAudioPlayer;
        this.standbyAudioPlayer = oldPlayer;

        // Pause old player
        if (!oldPlayer.paused) {
          oldPlayer.pause();
        }

        // Active player starts IMMEDIATELY with 0ms delay!
        this.activeAudioPlayer.volume = vol;
        this.activeAudioPlayer.muted = (vol === 0);
        this.activeAudioPlayer.playbackRate = clipSpeed;

        if (Math.abs(this.activeAudioPlayer.currentTime - targetMediaTime) > 0.08) {
          this.activeAudioPlayer.currentTime = targetMediaTime;
        }

        const p = this.activeAudioPlayer.play();
        if (p !== undefined) p.catch(() => {});
        this._prewarmedClipId = null;
      } else {
        // Cold transition (e.g. user seeked or playback just started)
        const player = this.activeAudioPlayer;
        if (this.standbyAudioPlayer && !this.standbyAudioPlayer.paused) {
          this.standbyAudioPlayer.pause();
        }

        if (player.src !== mediaItem.url) {
          player.src = mediaItem.url;
        }
        player.volume = vol;
        player.muted = (vol === 0);
        player.playbackRate = clipSpeed;

        const onMeta = () => {
          if (Math.abs(player.currentTime - targetMediaTime) > 0.05) {
            player.currentTime = targetMediaTime;
          }
          if (this.state.isPlaying && player.paused) {
            const p = player.play();
            if (p !== undefined) p.catch(() => {});
          }
        };

        if (player.readyState >= 1) {
          if (Math.abs(player.currentTime - targetMediaTime) > 0.05) {
            player.currentTime = targetMediaTime;
          }
        } else {
          player.addEventListener('loadedmetadata', onMeta, { once: true });
        }

        if (this.state.isPlaying) {
          const p = player.play();
          if (p !== undefined) p.catch(() => {});
        }
      }
    } else {
      // Continuing within the same clip
      const player = this.activeAudioPlayer;
      if (player.volume !== vol) player.volume = vol;
      player.muted = (vol === 0);
      if (player.playbackRate !== clipSpeed) player.playbackRate = clipSpeed;

      // Only re-sync if drift > 0.25s
      if (Math.abs(player.currentTime - targetMediaTime) > 0.25) {
        player.currentTime = targetMediaTime;
      }

      if (this.state.isPlaying && player.paused) {
        const p = player.play();
        if (p !== undefined) p.catch(() => {});
      }
    }
  }

  prewarmNextClip(nextClip, nextIndex) {
    if (!nextClip || this._prewarmedClipId === nextClip.id) return;
    this._prewarmedClipId = nextClip.id;

    const mediaItem = this.state.getMedia(nextClip.mediaId);
    if (!mediaItem || mediaItem.type !== 'video') return;

    const targetStartMediaTime = nextClip.trimStart || 0;
    const clipSpeed = nextClip.speed || 1.0;
    const clipVol = nextClip.volume !== undefined ? nextClip.volume : 1.0;

    // 1. Pre-warm Visual Video Element (seek ahead in background)
    const videoClips = this.state.tracks.videoTrack.clips;
    const prevClip = nextIndex > 0 ? videoClips[nextIndex - 1] : null;
    const isConsecutiveSameMedia = prevClip && prevClip.mediaId === nextClip.mediaId;
    const useSecondary = isConsecutiveSameMedia && (nextIndex % 2 === 1);
    const nextVideoEl = this.getMediaElement(nextClip.mediaId, useSecondary);

    if (nextVideoEl && nextVideoEl.tagName === 'VIDEO' && nextVideoEl !== this.currentActiveEl) {
      this._prewarmingVideoEl = nextVideoEl;
      if (Math.abs(nextVideoEl.currentTime - targetStartMediaTime) > 0.05) {
        nextVideoEl.currentTime = targetStartMediaTime;
      }
    }

    // 2. Pre-warm Standby Audio Player (pre-load buffer ahead in background)
    const standby = this.standbyAudioPlayer;
    if (standby) {
      if (standby.src !== mediaItem.url) {
        standby.src = mediaItem.url;
      }
      standby.playbackRate = clipSpeed;
      standby.volume = Math.max(0, Math.min(1, clipVol));
      standby.muted = (clipVol === 0);

      const onMeta = () => {
        if (Math.abs(standby.currentTime - targetStartMediaTime) > 0.05) {
          standby.currentTime = targetStartMediaTime;
        }
      };

      if (standby.readyState >= 1) {
        if (Math.abs(standby.currentTime - targetStartMediaTime) > 0.05) {
          standby.currentTime = targetStartMediaTime;
        }
      } else {
        standby.addEventListener('loadedmetadata', onMeta, { once: true });
      }
    }
  }

  drawFrameImmediate(time) {
    this.renderFrame(time, this.canvas, this.ctx, { allowSeek: false });
  }

  renderCurrentFrame() {
    this.renderFrame(this.state.currentTime, this.canvas, this.ctx, { allowSeek: true });
  }

  renderFrame(time, canvas, ctx, options = { allowSeek: true }) {
    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Video / Image layer
    const videoTrack = this.state.tracks.videoTrack;
    let activeIndex = -1;
    for (let i = 0; i < videoTrack.clips.length; i++) {
      const c = videoTrack.clips[i];
      if (time >= c.startTime && time < (c.startTime + c.duration)) {
        activeIndex = i;
        break;
      }
    }
    if (activeIndex === -1 && videoTrack.clips.length > 0 && time >= this.state.duration - 0.05) {
      activeIndex = videoTrack.clips.length - 1;
    }

    const activeVideoClip = activeIndex >= 0 ? videoTrack.clips[activeIndex] : null;

    if (activeVideoClip) {
      const prevClip = activeIndex > 0 ? videoTrack.clips[activeIndex - 1] : null;
      const isConsecutiveSameMedia = prevClip && prevClip.mediaId === activeVideoClip.mediaId;
      const useSecondary = isConsecutiveSameMedia && (activeIndex % 2 === 1);
      const mediaEl = this.getMediaElement(activeVideoClip.mediaId, useSecondary);
      if (mediaEl) {
        ctx.save();

        // Optimized filter application: ONLY use ctx.filter if any property is non-default
        // Bypassing filter saves significant CoreImage / GPU rendering overhead on iOS
        const f = activeVideoClip.filters || {};
        const brightness = f.brightness !== undefined ? f.brightness : 100;
        const contrast = f.contrast !== undefined ? f.contrast : 100;
        const saturate = f.saturate !== undefined ? f.saturate : 100;
        const grayscale = f.grayscale !== undefined ? f.grayscale : 0;
        const sepia = f.sepia !== undefined ? f.sepia : 0;
        const blur = f.blur !== undefined ? f.blur : 0;

        const hasFilter = (brightness !== 100 || contrast !== 100 || saturate !== 100 || grayscale !== 0 || sepia !== 0 || blur !== 0);
        if (hasFilter) {
          ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) grayscale(${grayscale}%) sepia(${sepia}%) blur(${blur}px)`;
        } else {
          ctx.filter = 'none';
        }

        if (mediaEl.tagName === 'VIDEO') {
          // If paused or static frame, seek accurately without choking the decoder
          if (!this.state.isPlaying && options.allowSeek) {
            const clipSpeed = activeVideoClip.speed || 1.0;
            const targetTime = (activeVideoClip.trimStart || 0) + (time - activeVideoClip.startTime) * clipSpeed;
            // Prevent recursive seek loop by checking if targetTime is different from previous request
            if (!mediaEl.seeking && mediaEl._lastRequestedSeekTime !== targetTime && Math.abs(mediaEl.currentTime - targetTime) > 0.05) {
              mediaEl._lastRequestedSeekTime = targetTime;
              mediaEl.currentTime = targetTime;
            }
          }
          if (mediaEl.readyState >= 2) {
            this.drawImageCover(ctx, mediaEl, 0, 0, width, height);
          }
        } else if (mediaEl.tagName === 'IMG' && mediaEl.complete) {
          this.drawImageCover(ctx, mediaEl, 0, 0, width, height);
        }

        ctx.restore();
      }
    } else {
      // Empty timeline placeholder
      this.drawPlaceholder(ctx, width, height);
    }

    // 3. Render Text Layers
    const textTrack = this.state.tracks.textTrack;
    const activeTextClips = textTrack.clips.filter(
      c => time >= c.startTime && time <= (c.startTime + c.duration)
    );

    activeTextClips.forEach(textClip => {
      this.drawTextClip(ctx, textClip, width, height);
    });
  }

  drawImageCover(ctx, img, x, y, w, h) {
    const imgWidth = img.videoWidth || img.naturalWidth || img.width;
    const imgHeight = img.videoHeight || img.naturalHeight || img.height;
    if (!imgWidth || !imgHeight) return;

    // Aspect fit with letterbox / contain
    const imgAspect = imgWidth / imgHeight;
    const canvasAspect = w / h;

    let drawW, drawH, drawX, drawY;

    if (imgAspect > canvasAspect) {
      drawW = w;
      drawH = w / imgAspect;
      drawX = 0;
      drawY = (h - drawH) / 2;
    } else {
      drawH = h;
      drawW = h * imgAspect;
      drawX = (w - drawW) / 2;
      drawY = 0;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  }

  drawTextClip(ctx, clip, canvasW, canvasH) {
    ctx.save();

    // Scale font size relative to standard 1080p canvas
    const scale = canvasH / 1080;
    const actualFontSize = Math.round(clip.fontSize * scale);
    ctx.font = `bold ${actualFontSize}px ${clip.fontFamily || 'Arial, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const posX = clip.x * canvasW;
    const posY = clip.y * canvasH;

    const text = clip.text || '';
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const textH = actualFontSize * 1.2;

    // Draw background box if set
    if (clip.bgColor && clip.bgColor !== 'transparent') {
      ctx.fillStyle = clip.bgColor;
      const padding = 12 * scale;
      const radius = 6 * scale;
      this.drawRoundedRect(
        ctx,
        posX - textW / 2 - padding,
        posY - textH / 2 - padding / 2,
        textW + padding * 2,
        textH + padding,
        radius
      );
      ctx.fill();
    }

    // Text stroke / outline
    if (clip.strokeWidth > 0 && clip.strokeColor) {
      ctx.strokeStyle = clip.strokeColor;
      ctx.lineWidth = clip.strokeWidth * scale * 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, posX, posY);
    }

    // Text fill
    ctx.fillStyle = clip.color || '#ffffff';
    ctx.fillText(text, posX, posY);

    ctx.restore();
  }

  drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  drawPlaceholder(ctx, w, h) {
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.fillStyle = '#555566';
    ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Thêm video hoặc ảnh vào Timeline để bắt đầu', w / 2, h / 2);
    ctx.restore();
  }
}

window.CanvasRenderer = CanvasRenderer;
