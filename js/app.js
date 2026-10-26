/**
 * CapCut Mini - Main Application Bootstrap
 */

document.addEventListener('DOMContentLoaded', () => {
  const state = window.state;

  // 1. Initialize Engines
  const canvas = document.getElementById('preview-canvas');
  const renderer = new CanvasRenderer(canvas, state);
  const audioMixer = new AudioMixer(state);
  const exporter = new VideoExporter(state, renderer, audioMixer);

  // 2. Initialize UI Components
  const player = new PlayerComponent(document.querySelector('.preview-stage'), state);
  const timeline = new TimelineComponent(document.querySelector('.timeline-section'), state);
  const toolbar = new ToolbarComponent(document.querySelector('.timeline-toolbar'), state);
  const mediaManager = new MediaManagerComponent(document.querySelector('.sidebar'), state);
  const textEditor = new TextEditorComponent(document.querySelector('.sidebar'), state);
  const filterManager = new FilterManagerComponent(document.querySelector('.sidebar'), state);

  // 3. Tab Switching in Left Sidebar
  const tabButtons = document.querySelectorAll('.sidebar-tabs .tab-btn');
  const tabPanels = {
    media: document.getElementById('tab-panel-media'),
    text: document.getElementById('tab-panel-text'),
    filters: document.getElementById('tab-panel-filters')
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.keys(tabPanels).forEach(key => {
        if (tabPanels[key]) {
          tabPanels[key].style.display = key === tabName ? 'block' : 'none';
        }
      });
    });
  });

  // Switch to corresponding tab when selecting clip
  state.on('clip:selected', (selected) => {
    if (!selected) return;
    if (selected.trackType === 'textTrack') {
      const textTab = document.querySelector('.tab-btn[data-tab="text"]');
      if (textTab) textTab.click();
    } else if (selected.trackType === 'videoTrack') {
      // If user is on media tab, keep it or switch to filters if desired
    }
  });

  // 4. Export Modal Controller
  const exportModal = document.getElementById('export-modal');
  const openExportBtn = document.getElementById('btn-open-export');
  const closeExportBtn = document.getElementById('btn-close-export');
  const cancelModalBtn = document.getElementById('btn-cancel-modal');
  const startExportBtn = document.getElementById('btn-start-export');
  const cancelExportBtn = document.getElementById('btn-cancel-export');
  const finishExportBtn = document.getElementById('btn-finish-export');

  const settingsView = document.getElementById('export-settings-view');
  const progressView = document.getElementById('export-progress-view');
  const successView = document.getElementById('export-success-view');

  const progressFill = document.getElementById('export-progress-fill');
  const progressText = document.getElementById('export-progress-text');
  const fileNameInput = document.getElementById('export-file-name');
  const resolutionSelect = document.getElementById('export-resolution');
  const qualitySelect = document.getElementById('export-quality');

  const showExportView = (view) => {
    if (settingsView) settingsView.style.display = view === 'settings' ? 'block' : 'none';
    if (progressView) progressView.style.display = view === 'progress' ? 'block' : 'none';
    if (successView) successView.style.display = view === 'success' ? 'block' : 'none';
  };

  if (openExportBtn && exportModal) {
    openExportBtn.addEventListener('click', () => {
      // Check if timeline has any clips
      const hasClips = Object.values(state.tracks).some(t => t.clips.length > 0);
      if (!hasClips) {
        alert('Timeline hiện tại chưa có video hoặc hình ảnh nào! Vui lòng thêm clip trước khi xuất video.');
        return;
      }

      showExportView('settings');
      exportModal.classList.add('open');
    });

    const closeModal = () => {
      if (exporter.isExporting) {
        exporter.cancelExport();
      }
      exportModal.classList.remove('open');
    };

    if (closeExportBtn) closeExportBtn.addEventListener('click', closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
    if (finishExportBtn) finishExportBtn.addEventListener('click', closeModal);

    // Start Export
    if (startExportBtn) {
      startExportBtn.addEventListener('click', async () => {
        const fileName = (fileNameInput ? fileNameInput.value : '').trim() || 'CapCut_Mini_Video';
        state.project.name = fileName;
        const resolution = resolutionSelect ? resolutionSelect.value : '1080p';
        const bitrate = (qualitySelect && qualitySelect.value === 'high') ? 12000000 : 6000000;

        showExportView('progress');
        if (progressFill) progressFill.style.width = '0%';
        if (progressText) progressText.textContent = '0%';

        try {
          await exporter.exportProject(
            { resolution, bitrate },
            ({ percentage, currentTime, totalDuration }) => {
              if (progressFill) progressFill.style.width = `${percentage}%`;
              if (progressText) progressText.textContent = `${percentage}% (${currentTime.toFixed(1)}s / ${totalDuration.toFixed(1)}s)`;
            }
          );
          showExportView('success');
        } catch (err) {
          console.error('Export error:', err);
          alert('Có lỗi xảy ra trong quá trình xuất video: ' + err.message);
          showExportView('settings');
        }
      });
    }

    if (cancelExportBtn) {
      cancelExportBtn.addEventListener('click', () => {
        exporter.cancelExport();
        showExportView('settings');
      });
    }
  }

  // Initial render
  state.recalculateDuration();
  renderer.renderCurrentFrame();

  window.app = { state, renderer, audioMixer, exporter, player, timeline, toolbar, mediaManager, textEditor, filterManager };

  // If URL has ?demo=true or demo requested, auto create sample
  if (new URLSearchParams(window.location.search).get('demo') === 'true') {
    setTimeout(() => {
      mediaManager.createSampleMedia();
    }, 200);
  }

  console.log('🚀 CapCut Mini initialized successfully!');
});
