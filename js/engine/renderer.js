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

    // Cache of HTMLVideoElements / HTMLImageElements
    this.mediaElements = new Map();

    this.init();
  }

  init() {
    this.updateCanvasDimensions();

    this.state.on('project:changed', () => {
      this.updateCanvasDimensions();
      this.renderCurrentFrame();
    });

    this.state.on('seek', () => {
      this.renderCurrentFrame();
    });

    this.state.on('tracks:changed', () => {
      this.lastActiveClipId = null;
      this.mediaElements.forEach(el => {
        el._lastRequestedSeekTime = null;
      });
      this.renderCurrentFrame();
    });

    this.state.on('playback:play', () => {
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

  getMediaElement(mediaId) {
    if (!mediaId) return null;
    if (this.mediaElements.has(mediaId)) {
      return this.mediaElements.get(mediaId);
    }
    const mediaItem = this.state.getMedia(mediaId);
    if (!mediaItem) return null;

    if (mediaItem.type === 'video') {
      const video = document.createElement('video');
      video.src = mediaItem.url;
      video.crossOrigin = 'anonymous';
      video.muted = true; // Audio is handled via AudioMixer or sync
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('seeked', () => {
        if (!this.state.isPlaying) {
          this.drawFrameImmediate(this.state.currentTime);
        }
      });
      this.mediaElements.set(mediaId, video);
      return video;
    } else if (mediaItem.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.renderCurrentFrame();
      };
      img.src = mediaItem.url;
      this.mediaElements.set(mediaId, img);
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
  }

  syncActiveVideos(isPlaying) {
    const time = this.state.currentTime;
    const videoClips = this.state.tracks.videoTrack.clips;

    // Identify the single active clip at current timestamp
    const activeClip = videoClips.find(
      c => time >= c.startTime && time < (c.startTime + c.duration)
    );
    const activeEl = activeClip ? this.getMediaElement(activeClip.mediaId) : null;

    // 1. Pause any video element that is NOT currently active
    this.mediaElements.forEach((el) => {
      if (el.tagName === 'VIDEO' && el !== activeEl && !el.paused) {
        el.pause();
      }
    });

    // 2. Control the active video element (never pause it if shared across cut clips)
    if (activeClip && activeEl && activeEl.tagName === 'VIDEO') {
      const clipSpeed = activeClip.speed || 1.0;
      const targetMediaTime = (activeClip.trimStart || 0) + (time - activeClip.startTime) * clipSpeed;

      // When crossing between cut/split clips, immediately jump to clip's target start time
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
    const activeVideoClip = videoTrack.clips.find(
      c => time >= c.startTime && time < (c.startTime + c.duration)
    );

    if (activeVideoClip) {
      const mediaEl = this.getMediaElement(activeVideoClip.mediaId);
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
          this.drawImageCover(ctx, mediaEl, 0, 0, width, height);
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
