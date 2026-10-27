/**
 * CapCut Mini - Timeline Component
 */

class TimelineComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.rulerCanvas = document.getElementById('ruler-canvas');
    this.rulerCtx = this.rulerCanvas ? this.rulerCanvas.getContext('2d') : null;
    this.tracksContainer = document.getElementById('timeline-tracks-container');
    this.tracksContent = document.getElementById('tracks-content');
    this.playhead = document.getElementById('timeline-playhead');
    this.playheadHead = document.getElementById('playhead-head');

    this.zoomSlider = document.getElementById('timeline-zoom-slider');
    this.zoomInBtn = document.getElementById('btn-zoom-in');
    this.zoomOutBtn = document.getElementById('btn-zoom-out');

    this.isDraggingPlayhead = false;
    this.draggedClipInfo = null;

    this.init();
  }

  init() {
    this.bindEvents();
    this.initPinchToZoom();
    this.render();
  }

  getPixelsPerSecond() {
    return this.state.zoom;
  }

  timeToPixels(time) {
    return time * this.getPixelsPerSecond();
  }

  pixelsToTime(px) {
    return Math.max(0, px / this.getPixelsPerSecond());
  }

  updatePlayheadPosition() {
    if (!this.playhead) return;
    const px = this.timeToPixels(this.state.currentTime);
    this.playhead.style.left = `${px}px`;

    // Auto-scroll timeline when playhead reaches right edge during playback
    if (this.state.isPlaying && this.tracksContainer) {
      const scrollLeft = this.tracksContainer.scrollLeft;
      const clientWidth = this.tracksContainer.clientWidth;
      if (px > scrollLeft + clientWidth - 50) {
        this.tracksContainer.scrollLeft = px - 100;
      }
    }
  }

  drawRuler() {
    if (!this.rulerCanvas || !this.rulerCtx) return;

    const width = Math.max(
      this.tracksContainer.clientWidth,
      this.timeToPixels(this.state.duration) + 300
    );
    const height = 24;

    this.rulerCanvas.width = width;
    this.rulerCanvas.height = height;

    const ctx = this.rulerCtx;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#141419';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#71717a';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textBaseline = 'middle';

    const pps = this.getPixelsPerSecond();
    let secondStep = 1;
    if (pps < 20) secondStep = 10;
    else if (pps < 40) secondStep = 5;
    else if (pps < 75) secondStep = 2;
    else secondStep = 1;

    const maxSeconds = Math.ceil(width / pps);

    for (let sec = 0; sec <= maxSeconds; sec++) {
      const x = sec * pps;

      if (sec % secondStep === 0) {
        // Major tick
        ctx.strokeStyle = '#444452';
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, height);
        ctx.stroke();

        const mins = Math.floor(sec / 60);
        const remSecs = sec % 60;
        const label = `${mins.toString().padStart(2, '0')}:${remSecs.toString().padStart(2, '0')}`;
        ctx.fillText(label, x + 4, 8);
      } else {
        // Minor tick
        ctx.strokeStyle = '#272733';
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }

  renderTracks() {
    if (!this.tracksContent) return;

    // Clear tracks content (playhead is now permanently anchored in tracksContainer on the ruler)
    this.tracksContent.innerHTML = '';

    const minWidth = this.timeToPixels(this.state.duration) + 300;
    this.tracksContent.style.width = `${minWidth}px`;

    // Render 3 tracks in order: 1. Video (top) -> 2. Text (middle) -> 3. Audio (bottom)
    const trackOrder = [
      { key: 'videoTrack', label: 'V', name: 'Video chính' },
      { key: 'textTrack', label: 'T', name: 'Văn bản (Text)' },
      { key: 'audioTrack', label: 'A', name: 'Âm thanh (BGM)' }
    ];

    trackOrder.forEach(({ key, label, name }) => {
      const track = this.state.tracks[key];
      const trackEl = document.createElement('div');
      trackEl.className = `timeline-track ${key}`;
      trackEl.dataset.trackType = key;

      // Track label badge
      const badgeEl = document.createElement('div');
      badgeEl.className = 'track-badge';
      badgeEl.innerHTML = `<span class="track-badge-tag">${label}</span> <span>${name}</span>`;
      trackEl.appendChild(badgeEl);

      // Track clips
      track.clips.forEach(clip => {
        const clipEl = this.createClipElement(key, clip);
        trackEl.appendChild(clipEl);
      });

      this.tracksContent.appendChild(trackEl);
    });

    this.updatePlayheadPosition();
  }

  createClipElement(trackType, clip) {
    const pps = this.getPixelsPerSecond();
    const clipEl = document.createElement('div');
    const isSelected = this.state.selectedClip && this.state.selectedClip.clipId === clip.id;

    clipEl.className = `timeline-clip ${clip.type}-clip ${isSelected ? 'selected' : ''}`;
    clipEl.id = `clip-el-${clip.id}`;
    clipEl.style.left = `${clip.startTime * pps}px`;
    clipEl.style.width = `${Math.max(12, clip.duration * pps)}px`;

    // Left trim handle
    const handleStart = document.createElement('div');
    handleStart.className = 'clip-handle handle-start';
    handleStart.title = 'Kéo để cắt đầu';

    // Right trim handle
    const handleEnd = document.createElement('div');
    handleEnd.className = 'clip-handle handle-end';
    handleEnd.title = 'Kéo để cắt đuôi';

    // Content label
    const content = document.createElement('div');
    content.className = 'clip-content';

    let icon = '🎬';
    if (clip.type === 'text') icon = '✍️';
    if (clip.type === 'audio') icon = '🎵';
    if (clip.type === 'image') icon = '🖼️';

    content.innerHTML = `<span>${icon}</span> <span>${clip.name || clip.text || 'Clip'}</span>`;

    clipEl.appendChild(handleStart);
    clipEl.appendChild(content);
    clipEl.appendChild(handleEnd);

    // Event: select clip
    const onClipSelect = (e) => {
      if (e.target.classList.contains('clip-handle')) return;
      this.state.selectClip(trackType, clip.id);
      this.initClipDrag(e, trackType, clip);
    };
    clipEl.addEventListener('mousedown', onClipSelect);
    clipEl.addEventListener('touchstart', onClipSelect, { passive: true });

    // Event: trim handles
    const onStartTrim = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.initClipTrim(e, trackType, clip, 'start');
    };
    handleStart.addEventListener('mousedown', onStartTrim);
    handleStart.addEventListener('touchstart', onStartTrim, { passive: false });

    const onEndTrim = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.initClipTrim(e, trackType, clip, 'end');
    };
    handleEnd.addEventListener('mousedown', onEndTrim);
    handleEnd.addEventListener('touchstart', onEndTrim, { passive: false });

    return clipEl;
  }

  initClipDrag(e, trackType, clip) {
    if (e.type === 'mousedown') e.preventDefault();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const startY = e.touches ? e.touches[0].clientY : e.clientY;
    const initialStartTime = clip.startTime;
    const pps = this.getPixelsPerSecond();
    const clipEl = document.getElementById(`clip-el-${clip.id}`);
    if (!clipEl) return;

    const isVideoTrack = (trackType === 'videoTrack');
    const track = this.state.tracks[trackType];

    let isReordering = false;
    let targetIndex = track ? track.clips.findIndex(c => c.id === clip.id) : 0;
    let latestStartTime = initialStartTime;
    let rafId = null;

    // Edge auto-scroll variables
    let autoScrollRaf = null;
    let autoScrollSpeed = 0;
    let lastClientX = startX;

    // Drop indicator element
    let dropIndicator = document.getElementById('clip-drop-indicator');
    if (!dropIndicator) {
      dropIndicator = document.createElement('div');
      dropIndicator.id = 'clip-drop-indicator';
      dropIndicator.className = 'clip-drop-indicator';
      this.tracksContainer.appendChild(dropIndicator);
    }

    const performAutoScroll = () => {
      if (autoScrollSpeed !== 0 && this.tracksContainer) {
        this.tracksContainer.scrollLeft += autoScrollSpeed;
        updateReorderUI(lastClientX);
      }
      autoScrollRaf = requestAnimationFrame(performAutoScroll);
    };

    const startAutoScroll = () => {
      if (!autoScrollRaf) {
        autoScrollRaf = requestAnimationFrame(performAutoScroll);
      }
    };

    const stopAutoScroll = () => {
      if (autoScrollRaf) {
        cancelAnimationFrame(autoScrollRaf);
        autoScrollRaf = null;
      }
      autoScrollSpeed = 0;
    };

    const updateReorderUI = (currentX) => {
      lastClientX = currentX;
      const rect = this.tracksContainer.getBoundingClientRect();
      const containerX = (currentX - rect.left) + this.tracksContainer.scrollLeft;
      const cardWidth = 72;
      clipEl.style.left = `${containerX - cardWidth / 2}px`;

      // Calculate insertion target among other clips
      const otherClips = track.clips.filter(c => c.id !== clip.id);
      const fingerTime = this.pixelsToTime(containerX);

      let indicatorTime = 0;
      if (otherClips.length > 0) {
        if (fingerTime < (otherClips[0].startTime + otherClips[0].duration * 0.5)) {
          targetIndex = 0;
          indicatorTime = otherClips[0].startTime;
        } else if (fingerTime >= (otherClips[otherClips.length - 1].startTime + otherClips[otherClips.length - 1].duration * 0.5)) {
          targetIndex = otherClips.length;
          indicatorTime = otherClips[otherClips.length - 1].startTime + otherClips[otherClips.length - 1].duration;
        } else {
          for (let i = 0; i < otherClips.length - 1; i++) {
            const midA = otherClips[i].startTime + otherClips[i].duration * 0.5;
            const midB = otherClips[i + 1].startTime + otherClips[i + 1].duration * 0.5;
            if (fingerTime >= midA && fingerTime < midB) {
              targetIndex = i + 1;
              indicatorTime = otherClips[i].startTime + otherClips[i].duration;
              break;
            }
          }
        }
      }

      // Show glowing cyan insertion indicator
      dropIndicator.style.left = `${indicatorTime * pps}px`;
      dropIndicator.style.display = 'block';

      // Edge proximity detection for continuous Auto-Scroll
      const edgeThreshold = 55;
      if (currentX < rect.left + edgeThreshold) {
        const ratio = Math.max(0.1, (rect.left + edgeThreshold - currentX) / edgeThreshold);
        autoScrollSpeed = -Math.round(4 + ratio * 20); // scroll left
        startAutoScroll();
      } else if (currentX > rect.right - edgeThreshold) {
        const ratio = Math.max(0.1, (currentX - (rect.right - edgeThreshold)) / edgeThreshold);
        autoScrollSpeed = Math.round(4 + ratio * 20); // scroll right
        startAutoScroll();
      } else {
        autoScrollSpeed = 0;
      }
    };

    const onMove = (moveEvent) => {
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      if (!isReordering) {
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          isReordering = true;
          if (isVideoTrack && track && track.clips.length > 1) {
            clipEl.classList.add('clip-reordering');
          }
        }
      }

      if (moveEvent.cancelable) moveEvent.preventDefault();

      if (isVideoTrack && track && track.clips.length > 1 && isReordering) {
        updateReorderUI(currentX);
      } else {
        // Standard dragging for audio / text tracks
        const deltaTime = deltaX / pps;
        let newStartTime = Math.max(0, initialStartTime + deltaTime);
        if (Math.abs(newStartTime) < 0.1) newStartTime = 0;
        latestStartTime = newStartTime;

        if (clipEl) {
          clipEl.style.left = `${latestStartTime * pps}px`;
        }
        clip.startTime = latestStartTime;

        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            this.state.seek(latestStartTime, { emit: true });
          });
        }
      }
    };

    const onEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      stopAutoScroll();

      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);

      if (dropIndicator) {
        dropIndicator.style.display = 'none';
      }
      clipEl.classList.remove('clip-reordering');

      if (isVideoTrack && track && track.clips.length > 1 && isReordering) {
        const originalIndex = track.clips.findIndex(c => c.id === clip.id);
        if (originalIndex !== -1 && targetIndex !== originalIndex) {
          // Reorder clips in track
          const [movedClip] = track.clips.splice(originalIndex, 1);
          track.clips.splice(targetIndex, 0, movedClip);

          // Magnetic auto-snap & ripple
          this.state.enforceMagneticTrack('videoTrack');
          this.state.pushHistory('Chèn đổi thứ tự video');
          this.state.recalculateDuration();
          this.state.selectClip(trackType, movedClip.id);
          this.state.emit('tracks:changed', this.state.tracks);
          this.state.seek(movedClip.startTime);
        } else {
          // Revert position and expand back to full width
          clipEl.style.left = `${clip.startTime * pps}px`;
          clipEl.style.width = `${Math.max(12, clip.duration * pps)}px`;
          this.renderTracks();
        }
      } else if (!isVideoTrack && isReordering) {
        this.state.updateClip(trackType, clip.id, { startTime: latestStartTime });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  initPinchToZoom() {
    if (!this.tracksContainer) return;

    let initialDist = 0;
    let initialZoom = this.state.zoom;
    let anchorTime = 0;
    let anchorClientX = 0;

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        initialDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = this.state.zoom;
        const rect = this.tracksContainer.getBoundingClientRect();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        anchorClientX = midX - rect.left;
        anchorTime = this.pixelsToTime(anchorClientX + this.tracksContainer.scrollLeft);
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2 && initialDist > 0) {
        if (e.cancelable) e.preventDefault();
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = currentDist / initialDist;
        const newZoom = Math.max(15, Math.min(220, Math.round(initialZoom * scale)));
        if (newZoom !== this.state.zoom) {
          this.state.setZoom(newZoom);
          if (this.zoomSlider) this.zoomSlider.value = newZoom;
          // Keep the point under fingers anchored in view
          const newMidPx = this.timeToPixels(anchorTime);
          this.tracksContainer.scrollLeft = Math.max(0, newMidPx - anchorClientX);
        }
      }
    };

    const onTouchEnd = (e) => {
      if (e.touches.length < 2) {
        initialDist = 0;
      }
    };

    this.tracksContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    this.tracksContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    this.tracksContainer.addEventListener('touchend', onTouchEnd);
    this.tracksContainer.addEventListener('touchcancel', onTouchEnd);

    // Trackpad pinch-to-zoom on Mac
    this.tracksContainer.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = -e.deltaY * 0.4;
        const newZoom = Math.max(15, Math.min(220, Math.round(this.state.zoom + zoomDelta)));
        this.state.setZoom(newZoom);
        if (this.zoomSlider) this.zoomSlider.value = newZoom;
      }
    }, { passive: false });
  }

  initClipTrim(e, trackType, clip, handleType) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const initialStartTime = clip.startTime;
    const initialDuration = clip.duration;
    const initialTrimStart = clip.trimStart || 0;
    const clipSpeed = clip.speed || 1.0;
    const pps = this.getPixelsPerSecond();
    const clipEl = document.getElementById(`clip-el-${clip.id}`);

    const isVideoTrack = (trackType === 'videoTrack');
    const track = this.state.tracks[trackType];
    const clipIndex = track ? track.clips.findIndex(c => c.id === clip.id) : -1;

    // Cache subsequent clips for 120fps real-time magnetic ripple
    const subsequentClips = [];
    if (isVideoTrack && track && clipIndex !== -1) {
      for (let i = clipIndex + 1; i < track.clips.length; i++) {
        const subClip = track.clips[i];
        const subEl = document.getElementById(`clip-el-${subClip.id}`);
        if (subEl) {
          subsequentClips.push({
            clip: subClip,
            el: subEl,
            initialStart: subClip.startTime
          });
        }
      }
    }

    let latestStart = initialStartTime;
    let latestDuration = initialDuration;
    let latestTrimStart = initialTrimStart;
    let rafId = null;

    const onMove = (moveEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - startX;
      const deltaTime = deltaX / pps;

      if (handleType === 'start') {
        if (isVideoTrack) {
          // In magnetic video track, trimming start cuts off the beginning while remaining attached
          const deltaTrimSeconds = deltaTime * clipSpeed;
          latestTrimStart = Math.max(0, initialTrimStart + deltaTrimSeconds);
          if (clip.mediaDuration && clip.type !== 'image') {
            latestTrimStart = Math.min(latestTrimStart, Math.max(0, clip.mediaDuration - 0.2));
          }
          const actualDeltaTrim = (latestTrimStart - initialTrimStart) / clipSpeed;
          latestDuration = Math.max(0.2, initialDuration - actualDeltaTrim);
          latestStart = initialStartTime;
        } else {
          latestStart = Math.max(0, initialStartTime + deltaTime);
          const diff = latestStart - initialStartTime;
          latestDuration = Math.max(0.2, initialDuration - diff);
          latestTrimStart = Math.max(0, initialTrimStart + (diff * clipSpeed));
        }
      } else {
        // handleType === 'end'
        latestDuration = Math.max(0.2, initialDuration + deltaTime);
        if (clip.mediaDuration && clip.type !== 'image') {
          const maxAvail = (clip.mediaDuration - (clip.trimStart || 0)) / clipSpeed;
          if (maxAvail > 0.2) {
            latestDuration = Math.min(latestDuration, maxAvail);
          }
        }
        latestStart = initialStartTime;
      }

      // Ultra-fast direct DOM update for current clip (zero lag, 120fps smooth!)
      if (clipEl) {
        clipEl.style.left = `${latestStart * pps}px`;
        clipEl.style.width = `${Math.max(12, latestDuration * pps)}px`;
      }

      // Real-time magnetic ripple: subsequent clips dynamically slide in sync
      if (isVideoTrack && subsequentClips.length > 0) {
        const durationDiff = latestDuration - initialDuration;
        for (const sub of subsequentClips) {
          const newSubLeft = (sub.initialStart + durationDiff) * pps;
          sub.el.style.left = `${newSubLeft}px`;
        }
      }

      // Update in-memory clip
      clip.startTime = latestStart;
      clip.duration = latestDuration;
      clip.trimStart = latestTrimStart;

      // Throttled frame seek preview
      if (!rafId) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const previewTime = handleType === 'start'
            ? latestStart
            : (latestStart + latestDuration - 0.05);
          this.state.seek(previewTime, { emit: true });
        });
      }
    };

    const onEnd = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);

      // Commit final trimmed values ONCE on release!
      this.state.updateClip(trackType, clip.id, {
        startTime: latestStart,
        duration: latestDuration,
        trimStart: latestTrimStart
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  bindPlayheadEvents() {
    if (!this.playheadHead) return;

    let rafId = null;

    const startDrag = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.isDraggingPlayhead = true;

      const onMove = (moveEvent) => {
        if (!this.isDraggingPlayhead) return;
        if (moveEvent.cancelable) moveEvent.preventDefault();
        const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
        const rect = this.tracksContainer.getBoundingClientRect();
        const clientX = currentX - rect.left + this.tracksContainer.scrollLeft;
        const newTime = this.pixelsToTime(clientX);

        // Instant playhead needle movement
        if (this.playhead) {
          this.playhead.style.left = `${this.timeToPixels(newTime)}px`;
        }

        // Throttled frame seek
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = null;
            this.state.seek(newTime);
          });
        }
      };

      const onEnd = () => {
        if (rafId) cancelAnimationFrame(rafId);
        this.isDraggingPlayhead = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    };

    this.playheadHead.addEventListener('mousedown', startDrag);
    this.playheadHead.addEventListener('touchstart', startDrag, { passive: false });
  }

  bindEvents() {
    // Ruler seeking (Click & Touch Drag)
    if (this.rulerCanvas) {
      const handleRulerSeek = (e) => {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const rect = this.tracksContainer.getBoundingClientRect();
        const containerX = (clientX - rect.left) + this.tracksContainer.scrollLeft;
        const newTime = this.pixelsToTime(containerX);
        this.state.seek(newTime);
      };

      const startRulerDrag = (e) => {
        if (e.cancelable) e.preventDefault();
        handleRulerSeek(e);

        const onMove = (moveEvt) => {
          if (moveEvt.cancelable) moveEvt.preventDefault();
          handleRulerSeek(moveEvt);
        };

        const onEnd = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onEnd);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
      };

      this.rulerCanvas.addEventListener('mousedown', startRulerDrag);
      this.rulerCanvas.addEventListener('touchstart', startRulerDrag, { passive: false });
    }

    // Zoom Controls
    if (this.zoomSlider) {
      this.zoomSlider.addEventListener('input', (e) => {
        this.state.setZoom(parseFloat(e.target.value));
      });
    }

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener('click', () => {
        this.state.setZoom(this.state.zoom + 15);
        if (this.zoomSlider) this.zoomSlider.value = this.state.zoom;
      });
    }

    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener('click', () => {
        this.state.setZoom(this.state.zoom - 15);
        if (this.zoomSlider) this.zoomSlider.value = this.state.zoom;
      });
    }

    // State Listeners
    this.state.on('seek', () => this.updatePlayheadPosition());
    this.state.on('timeupdate', () => this.updatePlayheadPosition());
    this.state.on('tracks:changed', () => this.render());
    this.state.on('duration:changed', () => this.render());
    this.state.on('zoom:changed', () => this.render());
    this.state.on('clip:selected', () => this.updateClipSelectionHighlight());

    this.bindPlayheadEvents();
  }

  updateClipSelectionHighlight() {
    document.querySelectorAll('.timeline-clip').forEach(el => {
      el.classList.remove('selected');
    });
    if (this.state.selectedClip) {
      const activeEl = document.getElementById(`clip-el-${this.state.selectedClip.clipId}`);
      if (activeEl) activeEl.classList.add('selected');
    }
  }

  render() {
    this.drawRuler();
    this.renderTracks();
  }
}

window.TimelineComponent = TimelineComponent;
