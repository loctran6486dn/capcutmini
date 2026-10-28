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

  window.app = { state, renderer, audioMixer, exporter };

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
        const isHigh = qualitySelect && qualitySelect.value === 'high';
        let bitrate = 12000000;
        if (resolution === '4k') {
          bitrate = isHigh ? 50000000 : 32000000; // 50 Mbps / 32 Mbps for 4K Ultra HD
        } else if (resolution === '2k') {
          bitrate = isHigh ? 28000000 : 18000000; // 28 Mbps / 18 Mbps for 2K Quad HD
        } else if (resolution === '1080p') {
          bitrate = isHigh ? 16000000 : 9000000;  // 16 Mbps / 9 Mbps for 1080p Full HD
        } else {
          bitrate = isHigh ? 8000000 : 4500000;   // 8 Mbps / 4.5 Mbps for 720p HD
        }

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

  // 5. Bottom Action Dock & Drawers Controller
  const btnDockVideo = document.getElementById('btn-dock-video');
  const btnDockImage = document.getElementById('btn-dock-image');
  const btnDockAudio = document.getElementById('btn-dock-audio');
  const btnDockText = document.getElementById('btn-dock-text');
  const btnDockFilters = document.getElementById('btn-dock-filters');
  const btnDockSample = document.getElementById('btn-dock-sample');

  const inputPickVideo = document.getElementById('input-pick-video');
  const inputPickImage = document.getElementById('input-pick-image');
  const inputPickAudio = document.getElementById('input-pick-audio');

  const drawerOverlay = document.getElementById('drawer-overlay');
  const drawerText = document.getElementById('drawer-text');
  const drawerFilter = document.getElementById('drawer-filter');

  const closeDrawers = () => {
    if (drawerText) drawerText.classList.remove('open');
    if (drawerFilter) drawerFilter.classList.remove('open');
    if (drawerOverlay) drawerOverlay.classList.remove('open');
  };

  if (drawerOverlay) drawerOverlay.addEventListener('click', closeDrawers);
  const btnCloseTextDrawer = document.getElementById('btn-close-text-drawer');
  if (btnCloseTextDrawer) btnCloseTextDrawer.addEventListener('click', closeDrawers);
  const btnCloseFilterDrawer = document.getElementById('btn-close-filter-drawer');
  if (btnCloseFilterDrawer) btnCloseFilterDrawer.addEventListener('click', closeDrawers);

  // File picker triggers
  if (btnDockVideo && inputPickVideo) {
    btnDockVideo.addEventListener('click', () => inputPickVideo.click());
    inputPickVideo.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        mediaManager.handleFiles(e.target.files);
        e.target.value = '';
      }
    });
  }

  if (btnDockImage && inputPickImage) {
    btnDockImage.addEventListener('click', () => inputPickImage.click());
    inputPickImage.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        mediaManager.handleFiles(e.target.files);
        e.target.value = '';
      }
    });
  }

  if (btnDockAudio && inputPickAudio) {
    btnDockAudio.addEventListener('click', () => inputPickAudio.click());
    inputPickAudio.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        mediaManager.handleFiles(e.target.files);
        e.target.value = '';
      }
    });
  }

  if (btnDockSample) {
    btnDockSample.addEventListener('click', () => {
      mediaManager.createSampleMedia();
    });
  }

  // Text Drawer triggers
  if (btnDockText && drawerText) {
    btnDockText.addEventListener('click', () => {
      closeDrawers();
      drawerText.classList.add('open');
      if (drawerOverlay) drawerOverlay.classList.add('open');
    });

    const addTitleBtn = document.getElementById('btn-add-title-drawer');
    if (addTitleBtn) {
      addTitleBtn.addEventListener('click', () => {
        state.addClipToTrack('textTrack', {
          text: 'TIÊU ĐỀ VIDEO',
          fontSize: 60,
          color: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 4,
          duration: 4,
          x: 0.5,
          y: 0.3
        });
        closeDrawers();
      });
    }

    const addSubtitleBtn = document.getElementById('btn-add-subtitle-drawer');
    if (addSubtitleBtn) {
      addSubtitleBtn.addEventListener('click', () => {
        state.addClipToTrack('textTrack', {
          text: 'Thêm phụ đề nội dung ở đây...',
          fontSize: 38,
          color: '#ffffff',
          strokeColor: '#000000',
          strokeWidth: 2,
          bgColor: 'rgba(0, 0, 0, 0.65)',
          duration: 3,
          x: 0.5,
          y: 0.82
        });
        closeDrawers();
      });
    }

    const addTiktokBtn = document.getElementById('btn-add-tiktok-drawer');
    if (addTiktokBtn) {
      addTiktokBtn.addEventListener('click', () => {
        state.addClipToTrack('textTrack', {
          text: 'PHONG CÁCH TIKTOK 🔥',
          fontSize: 50,
          color: '#facc15',
          strokeColor: '#000000',
          strokeWidth: 5,
          duration: 3.5,
          x: 0.5,
          y: 0.5
        });
        closeDrawers();
      });
    }

    const addNeonBtn = document.getElementById('btn-add-neon-drawer');
    if (addNeonBtn) {
      addNeonBtn.addEventListener('click', () => {
        state.addClipToTrack('textTrack', {
          text: 'NEON CYBERPUNK ⚡',
          fontSize: 46,
          color: '#00f2fe',
          strokeColor: '#4c1d95',
          strokeWidth: 4,
          bgColor: 'rgba(15, 23, 42, 0.8)',
          duration: 4,
          x: 0.5,
          y: 0.5
        });
        closeDrawers();
      });
    }

    // Text Properties in Drawer
    const drawerPropText = document.getElementById('drawer-prop-text');
    const drawerPropSize = document.getElementById('drawer-prop-font-size');
    const drawerPropColor = document.getElementById('drawer-prop-color');
    const drawerPropStroke = document.getElementById('drawer-prop-stroke');
    const drawerTextPropsContainer = document.getElementById('drawer-text-props');

    if (drawerPropText) {
      drawerPropText.addEventListener('input', (e) => {
        const selected = state.getSelectedClip();
        if (selected && selected.type === 'text') {
          state.updateClip('textTrack', selected.id, { text: e.target.value });
        }
      });
    }

    if (drawerPropSize) {
      drawerPropSize.addEventListener('input', (e) => {
        const selected = state.getSelectedClip();
        if (selected && selected.type === 'text') {
          state.updateClip('textTrack', selected.id, { fontSize: parseInt(e.target.value) });
        }
      });
    }

    if (drawerPropColor) {
      drawerPropColor.addEventListener('input', (e) => {
        const selected = state.getSelectedClip();
        if (selected && selected.type === 'text') {
          state.updateClip('textTrack', selected.id, { color: e.target.value });
        }
      });
    }

    if (drawerPropStroke) {
      drawerPropStroke.addEventListener('input', (e) => {
        const selected = state.getSelectedClip();
        if (selected && selected.type === 'text') {
          state.updateClip('textTrack', selected.id, { strokeColor: e.target.value });
        }
      });
    }

    state.on('clip:selected', (selected) => {
      const isText = selected && selected.type === 'text';
      if (drawerTextPropsContainer) {
        drawerTextPropsContainer.style.display = isText ? 'block' : 'none';
        if (isText) {
          if (drawerPropText) drawerPropText.value = selected.text || '';
          if (drawerPropSize) drawerPropSize.value = selected.fontSize || 42;
          if (drawerPropColor) drawerPropColor.value = selected.color || '#ffffff';
          if (drawerPropStroke) drawerPropStroke.value = selected.strokeColor || '#000000';
        }
      }
    });
  }

  // Filter Drawer triggers
  if (btnDockFilters && drawerFilter) {
    btnDockFilters.addEventListener('click', () => {
      closeDrawers();
      drawerFilter.classList.add('open');
      if (drawerOverlay) drawerOverlay.classList.add('open');
    });

    drawerFilter.querySelectorAll('.filter-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        filterManager.applyPreset(preset);
        closeDrawers();
      });
    });
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
