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

    // Clear tracks content but preserve playhead
    const playheadHtml = this.playhead ? this.playhead.outerHTML : '';
    this.tracksContent.innerHTML = playheadHtml;
    this.playhead = document.getElementById('timeline-playhead');
    this.playheadHead = document.getElementById('playhead-head');
    if (this.playheadHead) {
      this.bindPlayheadEvents();
    }

    const minWidth = this.timeToPixels(this.state.duration) + 300;
    this.tracksContent.style.width = `${minWidth}px`;

    // Render 3 tracks in order: Text -> Video -> Audio
    const trackOrder = [
      { key: 'textTrack', label: 'T', name: 'Văn bản (Text)' },
      { key: 'videoTrack', label: 'V', name: 'Video chính' },
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
    const initialStartTime = clip.startTime;
    const pps = this.getPixelsPerSecond();

    const onMove = (moveEvent) => {
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - startX;
      const deltaTime = deltaX / pps;
      const newStartTime = Math.max(0, initialStartTime + deltaTime);

      let finalStartTime = newStartTime;
      if (Math.abs(finalStartTime) < 0.1) finalStartTime = 0;
      if (Math.abs(finalStartTime - this.state.currentTime) < 0.15) {
        finalStartTime = this.state.currentTime;
      }

      this.state.updateClip(trackType, clip.id, { startTime: finalStartTime });
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
  }

  initClipTrim(e, trackType, clip, handleType) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.touches ? e.touches[0].clientX : e.clientX;
    const initialStartTime = clip.startTime;
    const initialDuration = clip.duration;
    const initialTrimStart = clip.trimStart || 0;
    const pps = this.getPixelsPerSecond();

    const onMove = (moveEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const currentX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const deltaX = currentX - startX;
      const deltaTime = deltaX / pps;

      if (handleType === 'start') {
        const newStart = Math.max(0, initialStartTime + deltaTime);
        const diff = newStart - initialStartTime;
        const newDuration = Math.max(0.2, initialDuration - diff);
        const newTrimStart = Math.max(0, initialTrimStart + diff);

        this.state.updateClip(trackType, clip.id, {
          startTime: newStart,
          duration: newDuration,
          trimStart: newTrimStart
        });
      } else {
        const newDuration = Math.max(0.2, initialDuration + deltaTime);
        this.state.updateClip(trackType, clip.id, {
          duration: newDuration
        });
      }
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
  }

  bindPlayheadEvents() {
    if (!this.playheadHead) return;

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
        this.state.seek(newTime);
      };

      const onEnd = () => {
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
    // Ruler click seeking
    if (this.rulerCanvas) {
      this.rulerCanvas.addEventListener('mousedown', (e) => {
        const rect = this.rulerCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const newTime = this.pixelsToTime(clickX);
        this.state.seek(newTime);
      });
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
