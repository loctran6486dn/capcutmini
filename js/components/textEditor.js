/**
 * CapCut Mini - Text Overlay & Subtitle Editor Component
 */

class TextEditorComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.textPanel = document.getElementById('text-property-panel');
    this.addTitleBtn = document.getElementById('btn-add-title');
    this.addSubtitleBtn = document.getElementById('btn-add-subtitle');
    this.addTiktokStyleBtn = document.getElementById('btn-add-tiktok-style');
    this.addNeonStyleBtn = document.getElementById('btn-add-neon-style');

    // Text properties inputs
    this.textInput = document.getElementById('prop-text-content');
    this.fontSizeInput = document.getElementById('prop-font-size');
    this.textColorInput = document.getElementById('prop-text-color');
    this.strokeColorInput = document.getElementById('prop-stroke-color');
    this.bgColorInput = document.getElementById('prop-bg-color');
    this.strokeWidthInput = document.getElementById('prop-stroke-width');

    this.init();
  }

  init() {
    this.bindEvents();
    this.updatePanelVisibility();
  }

  bindEvents() {
    // Add Title
    if (this.addTitleBtn) {
      this.addTitleBtn.addEventListener('click', () => {
        this.state.addClipToTrack('textTrack', {
          text: 'TIÊU ĐỀ VIDEO',
          fontSize: 64,
          color: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 4,
          bgColor: 'transparent',
          duration: 4,
          x: 0.5,
          y: 0.3
        });
      });
    }

    // Add Subtitle
    if (this.addSubtitleBtn) {
      this.addSubtitleBtn.addEventListener('click', () => {
        this.state.addClipToTrack('textTrack', {
          text: 'Thêm phụ đề nội dung ở đây...',
          fontSize: 38,
          color: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 2,
          bgColor: 'rgba(0, 0, 0, 0.6)',
          duration: 3,
          x: 0.5,
          y: 0.85
        });
      });
    }

    // Add TikTok Yellow Caption
    if (this.addTiktokStyleBtn) {
      this.addTiktokStyleBtn.addEventListener('click', () => {
        this.state.addClipToTrack('textTrack', {
          text: 'PHONG CÁCH TIKTOK 🔥',
          fontSize: 52,
          color: '#facc15', // yellow-400
          strokeColor: '#000000',
          strokeWidth: 5,
          bgColor: 'transparent',
          duration: 3.5,
          x: 0.5,
          y: 0.5
        });
      });
    }

    // Add Neon Style
    if (this.addNeonStyleBtn) {
      this.addNeonStyleBtn.addEventListener('click', () => {
        this.state.addClipToTrack('textTrack', {
          text: 'NEON CYBERPUNK ⚡',
          fontSize: 48,
          color: '#00f2fe',
          strokeColor: '#4c1d95',
          strokeWidth: 4,
          bgColor: 'rgba(15, 23, 42, 0.8)',
          duration: 4,
          x: 0.5,
          y: 0.5
        });
      });
    }

    // Property Inputs
    if (this.textInput) {
      this.textInput.addEventListener('input', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { text: e.target.value });
        }
      });
    }

    if (this.fontSizeInput) {
      this.fontSizeInput.addEventListener('input', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { fontSize: parseInt(e.target.value) });
        }
      });
    }

    if (this.textColorInput) {
      this.textColorInput.addEventListener('input', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { color: e.target.value });
        }
      });
    }

    if (this.strokeColorInput) {
      this.strokeColorInput.addEventListener('input', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { strokeColor: e.target.value });
        }
      });
    }

    if (this.strokeWidthInput) {
      this.strokeWidthInput.addEventListener('input', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { strokeWidth: parseInt(e.target.value) });
        }
      });
    }

    if (this.bgColorInput) {
      this.bgColorInput.addEventListener('change', (e) => {
        const selected = this.state.getSelectedClip();
        if (selected && selected.type === 'text') {
          this.state.updateClip('textTrack', selected.id, { bgColor: e.target.value });
        }
      });
    }

    // Canvas interactive dragging for text placement
    this.setupCanvasTextDrag();

    this.state.on('clip:selected', () => this.updatePanelVisibility());
  }

  updatePanelVisibility() {
    const selected = this.state.getSelectedClip();
    const isText = selected && selected.type === 'text';

    if (this.textPanel) {
      this.textPanel.style.display = isText ? 'block' : 'none';
      if (isText) {
        if (this.textInput) this.textInput.value = selected.text || '';
        if (this.fontSizeInput) this.fontSizeInput.value = selected.fontSize || 42;
        if (this.textColorInput) this.textColorInput.value = selected.color || '#ffffff';
        if (this.strokeColorInput) this.strokeColorInput.value = selected.strokeColor || '#000000';
        if (this.strokeWidthInput) this.strokeWidthInput.value = selected.strokeWidth !== undefined ? selected.strokeWidth : 3;
        if (this.bgColorInput) this.bgColorInput.value = selected.bgColor || 'transparent';
      }
    }
  }

  setupCanvasTextDrag() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) return;

    let isDragging = false;

    const onStart = (e) => {
      const selected = this.state.getSelectedClip();
      if (!selected || selected.type !== 'text') return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = canvas.getBoundingClientRect();
      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;

      if (Math.abs(normX - selected.x) < 0.3 && Math.abs(normY - selected.y) < 0.2) {
        isDragging = true;
      }
    };

    const onMove = (e) => {
      if (!isDragging) return;
      const selected = this.state.getSelectedClip();
      if (!selected || selected.type !== 'text') return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const rect = canvas.getBoundingClientRect();
      const normX = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
      const normY = Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height));

      this.state.updateClip('textTrack', selected.id, { x: normX, y: normY });
    };

    const onEnd = () => {
      isDragging = false;
    };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('touchstart', onStart, { passive: true });

    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: true });

    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
  }
}

window.TextEditorComponent = TextEditorComponent;
