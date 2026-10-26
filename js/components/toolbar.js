/**
 * CapCut Mini - Action Toolbar Component
 */

class ToolbarComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.splitBtn = document.getElementById('btn-split');
    this.deleteBtn = document.getElementById('btn-delete');
    this.duplicateBtn = document.getElementById('btn-duplicate');
    this.undoBtn = document.getElementById('btn-undo');
    this.redoBtn = document.getElementById('btn-redo');
    this.speedSelect = document.getElementById('select-speed');
    this.volumeSlider = document.getElementById('slider-volume');

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateControlsState();
  }

  updateControlsState() {
    const selected = this.state.getSelectedClip();
    const hasSelection = !!selected;

    if (this.splitBtn) this.splitBtn.disabled = !hasSelection;
    if (this.deleteBtn) this.deleteBtn.disabled = !hasSelection;
    if (this.duplicateBtn) this.duplicateBtn.disabled = !hasSelection;
    if (this.speedSelect) {
      this.speedSelect.disabled = !hasSelection || selected.type === 'text';
      if (hasSelection && selected.speed !== undefined) {
        this.speedSelect.value = selected.speed.toString();
      }
    }
    if (this.volumeSlider) {
      this.volumeSlider.disabled = !hasSelection || selected.type === 'text';
      if (hasSelection && selected.volume !== undefined) {
        this.volumeSlider.value = Math.round(selected.volume * 100);
      }
    }

    if (this.undoBtn) this.undoBtn.disabled = this.state.historyStack.length === 0;
    if (this.redoBtn) this.redoBtn.disabled = this.state.redoStack.length === 0;
  }

  bindEvents() {
    // Split
    if (this.splitBtn) {
      this.splitBtn.addEventListener('click', () => {
        const success = this.state.splitClipAtCurrentTime();
        if (!success) {
          alert('Để tách clip, vui lòng kéo kim thời gian (Playhead) vào bên trong clip đang chọn!');
        }
      });
    }

    // Delete
    if (this.deleteBtn) {
      this.deleteBtn.addEventListener('click', () => {
        if (this.state.selectedClip) {
          this.state.removeClip(this.state.selectedClip.trackType, this.state.selectedClip.clipId);
        }
      });
    }

    // Duplicate
    if (this.duplicateBtn) {
      this.duplicateBtn.addEventListener('click', () => {
        this.state.duplicateSelectedClip();
      });
    }

    // Speed
    if (this.speedSelect) {
      this.speedSelect.addEventListener('change', (e) => {
        if (this.state.selectedClip) {
          const speed = parseFloat(e.target.value);
          this.state.updateClip(this.state.selectedClip.trackType, this.state.selectedClip.clipId, { speed });
        }
      });
    }

    // Volume
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener('input', (e) => {
        if (this.state.selectedClip) {
          const volume = parseFloat(e.target.value) / 100;
          this.state.updateClip(this.state.selectedClip.trackType, this.state.selectedClip.clipId, { volume });
        }
      });
    }

    // Undo / Redo
    if (this.undoBtn) {
      this.undoBtn.addEventListener('click', () => {
        this.state.undo();
        this.updateControlsState();
      });
    }

    if (this.redoBtn) {
      this.redoBtn.addEventListener('click', () => {
        this.state.redo();
        this.updateControlsState();
      });
    }

    // State changes
    this.state.on('clip:selected', () => this.updateControlsState());
    this.state.on('tracks:changed', () => this.updateControlsState());

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.state.selectedClip) {
          e.preventDefault();
          this.state.removeClip(this.state.selectedClip.trackType, this.state.selectedClip.clipId);
        }
      }

      // 'S' key for Split
      if (e.key === 's' || e.key === 'S') {
        if (this.state.selectedClip) {
          e.preventDefault();
          this.state.splitClipAtCurrentTime();
        }
      }

      // Cmd+Z or Ctrl+Z for Undo / Redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.state.redo();
        } else {
          this.state.undo();
        }
      }
    });
  }
}

window.ToolbarComponent = ToolbarComponent;
