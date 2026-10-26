/**
 * CapCut Mini - Center Player Component
 */

class PlayerComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.playBtn = document.getElementById('btn-play');
    this.timecodeDisplay = document.getElementById('timecode-display');
    this.aspectRatioSelect = document.getElementById('select-aspect-ratio');
    this.fullscreenBtn = document.getElementById('btn-fullscreen');
    this.stepBackBtn = document.getElementById('btn-step-back');
    this.stepForwardBtn = document.getElementById('btn-step-forward');
    this.canvasWrapper = document.getElementById('canvas-wrapper');

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateTimecode(0);
    this.updateViewportSize();
  }

  formatTime(seconds) {
    const s = Math.max(0, seconds);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 30); // frame index (approx 30fps)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  }

  updateTimecode(time) {
    if (this.timecodeDisplay) {
      const cur = this.formatTime(time);
      const total = this.formatTime(this.state.duration);
      this.timecodeDisplay.textContent = `${cur} / ${total}`;
    }
  }

  updateViewportSize() {
    if (!this.canvasWrapper) return;
    const { aspectRatio, width, height } = this.state.project;

    const container = document.getElementById('preview-viewport');
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const maxW = Math.max(100, (rect.width || container.clientWidth) - 32);
    const maxH = Math.max(100, (rect.height || container.clientHeight) - 32);

    const aspect = width / height;
    let finalW, finalH;

    if (maxW / maxH > aspect) {
      finalH = maxH;
      finalW = maxH * aspect;
    } else {
      finalW = maxW;
      finalH = maxW / aspect;
    }

    this.canvasWrapper.style.width = `${Math.round(finalW)}px`;
    this.canvasWrapper.style.height = `${Math.round(finalH)}px`;
  }

  bindEvents() {
    // Play / Pause toggle
    if (this.playBtn) {
      this.playBtn.addEventListener('click', () => {
        this.state.togglePlay();
      });
    }

    this.state.on('playback:play', () => {
      if (this.playBtn) {
        this.playBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1"></rect>
            <rect x="14" y="4" width="4" height="16" rx="1"></rect>
          </svg>
        `;
        this.playBtn.title = "Tạm dừng (Space)";
      }
    });

    this.state.on('playback:pause', () => {
      if (this.playBtn) {
        this.playBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        `;
        this.playBtn.title = "Phát (Space)";
      }
    });

    // Step +/- 1 second
    if (this.stepBackBtn) {
      this.stepBackBtn.addEventListener('click', () => {
        this.state.seek(this.state.currentTime - 1);
      });
    }

    if (this.stepForwardBtn) {
      this.stepForwardBtn.addEventListener('click', () => {
        this.state.seek(this.state.currentTime + 1);
      });
    }

    // Time updates
    this.state.on('seek', (time) => {
      this.updateTimecode(time);
    });

    this.state.on('timeupdate', (time) => {
      this.updateTimecode(time);
    });

    this.state.on('duration:changed', () => {
      this.updateTimecode(this.state.currentTime);
    });

    // Aspect ratio change
    if (this.aspectRatioSelect) {
      this.aspectRatioSelect.addEventListener('change', (e) => {
        this.state.setAspectRatio(e.target.value);
        this.updateViewportSize();
      });
    }

    // Window resize
    window.addEventListener('resize', () => {
      this.updateViewportSize();
    });

    // Spacebar shortcut
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.state.togglePlay();
      }
    });

    // Fullscreen toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          this.canvasWrapper.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }
  }
}

window.PlayerComponent = PlayerComponent;
