/**
 * CapCut Mini - Filter & Video Adjustments Component
 */

class FilterManagerComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.filterPanel = document.getElementById('filter-property-panel');

    // Sliders
    this.brightnessInput = document.getElementById('filter-brightness');
    this.contrastInput = document.getElementById('filter-contrast');
    this.saturateInput = document.getElementById('filter-saturate');
    this.grayscaleInput = document.getElementById('filter-grayscale');
    this.sepiaInput = document.getElementById('filter-sepia');
    this.blurInput = document.getElementById('filter-blur');

    this.brightnessVal = document.getElementById('val-brightness');
    this.contrastVal = document.getElementById('val-contrast');
    this.saturateVal = document.getElementById('val-saturate');
    this.grayscaleVal = document.getElementById('val-grayscale');
    this.sepiaVal = document.getElementById('val-sepia');
    this.blurVal = document.getElementById('val-blur');

    this.resetBtn = document.getElementById('btn-reset-filters');
    this.presetButtons = document.querySelectorAll('.filter-preset-btn');

    this.init();
  }

  init() {
    this.bindEvents();
    this.updatePanelVisibility();
  }

  bindEvents() {
    const bindSlider = (input, valLabel, key, unit = '%') => {
      if (!input) return;
      input.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valLabel) valLabel.textContent = `${val}${unit}`;

        const selected = this.state.getSelectedClip();
        if (selected && (selected.type === 'video' || selected.type === 'image')) {
          const filters = { ...(selected.filters || {}) };
          filters[key] = val;
          this.state.updateClip('videoTrack', selected.id, { filters });
        }
      });
    };

    bindSlider(this.brightnessInput, this.brightnessVal, 'brightness', '%');
    bindSlider(this.contrastInput, this.contrastVal, 'contrast', '%');
    bindSlider(this.saturateInput, this.saturateVal, 'saturate', '%');
    bindSlider(this.grayscaleInput, this.grayscaleVal, 'grayscale', '%');
    bindSlider(this.sepiaInput, this.sepiaVal, 'sepia', '%');
    bindSlider(this.blurInput, this.blurVal, 'blur', 'px');

    // Preset Buttons
    if (this.presetButtons) {
      this.presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const presetName = btn.dataset.preset;
          this.applyPreset(presetName);
        });
      });
    }

    // Reset Filters
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this.applyPreset('normal');
      });
    }

    this.state.on('clip:selected', () => this.updatePanelVisibility());
  }

  applyPreset(presetName) {
    const selected = this.state.getSelectedClip();
    if (!selected || (selected.type !== 'video' && selected.type !== 'image')) {
      alert('Vui lòng chọn một đoạn video hoặc ảnh trên Timeline để áp dụng bộ lọc!');
      return;
    }

    let filters = {
      brightness: 100,
      contrast: 100,
      saturate: 100,
      grayscale: 0,
      sepia: 0,
      blur: 0
    };

    switch (presetName) {
      case 'cinematic':
        filters = { brightness: 95, contrast: 125, saturate: 90, grayscale: 0, sepia: 15, blur: 0 };
        break;
      case 'vibrant':
        filters = { brightness: 105, contrast: 115, saturate: 150, grayscale: 0, sepia: 0, blur: 0 };
        break;
      case 'vintage':
        filters = { brightness: 90, contrast: 110, saturate: 75, grayscale: 0, sepia: 45, blur: 0 };
        break;
      case 'bw':
        filters = { brightness: 100, contrast: 135, saturate: 0, grayscale: 100, sepia: 0, blur: 0 };
        break;
      case 'dreamy':
        filters = { brightness: 110, contrast: 90, saturate: 115, grayscale: 0, sepia: 0, blur: 3 };
        break;
      case 'normal':
      default:
        break;
    }

    this.state.updateClip('videoTrack', selected.id, { filters });
    this.updateSlidersFromClip(filters);
  }

  updateSlidersFromClip(f = {}) {
    const brightness = f.brightness !== undefined ? f.brightness : 100;
    const contrast = f.contrast !== undefined ? f.contrast : 100;
    const saturate = f.saturate !== undefined ? f.saturate : 100;
    const grayscale = f.grayscale !== undefined ? f.grayscale : 0;
    const sepia = f.sepia !== undefined ? f.sepia : 0;
    const blur = f.blur !== undefined ? f.blur : 0;

    if (this.brightnessInput) this.brightnessInput.value = brightness;
    if (this.contrastInput) this.contrastInput.value = contrast;
    if (this.saturateInput) this.saturateInput.value = saturate;
    if (this.grayscaleInput) this.grayscaleInput.value = grayscale;
    if (this.sepiaInput) this.sepiaInput.value = sepia;
    if (this.blurInput) this.blurInput.value = blur;

    if (this.brightnessVal) this.brightnessVal.textContent = `${brightness}%`;
    if (this.contrastVal) this.contrastVal.textContent = `${contrast}%`;
    if (this.saturateVal) this.saturateVal.textContent = `${saturate}%`;
    if (this.grayscaleVal) this.grayscaleVal.textContent = `${grayscale}%`;
    if (this.sepiaVal) this.sepiaVal.textContent = `${sepia}%`;
    if (this.blurVal) this.blurVal.textContent = `${blur}px`;
  }

  updatePanelVisibility() {
    const selected = this.state.getSelectedClip();
    const isVideoOrImg = selected && (selected.type === 'video' || selected.type === 'image');

    if (this.filterPanel) {
      this.filterPanel.style.display = isVideoOrImg ? 'block' : 'none';
      if (isVideoOrImg) {
        this.updateSlidersFromClip(selected.filters || {});
      }
    }
  }
}

window.FilterManagerComponent = FilterManagerComponent;
