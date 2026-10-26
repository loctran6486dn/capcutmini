/**
 * CapCut Mini - Media Manager Component
 */

class MediaManagerComponent {
  constructor(container, state) {
    this.container = container;
    this.state = state;

    this.dropzone = document.getElementById('media-dropzone');
    this.fileInput = document.getElementById('media-file-input');
    this.mediaGrid = document.getElementById('media-grid');
    this.sampleMediaBtn = document.getElementById('btn-add-sample-media');

    this.init();
  }

  init() {
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    // Dropzone click
    if (this.dropzone && this.fileInput) {
      this.dropzone.addEventListener('click', () => {
        this.fileInput.click();
      });

      // Drag and drop
      this.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropzone.classList.add('dragover');
      });

      this.dropzone.addEventListener('dragleave', () => {
        this.dropzone.classList.remove('dragover');
      });

      this.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFiles(e.dataTransfer.files);
        }
      });

      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFiles(e.target.files);
        }
      });
    }

    // Sample Media Generator
    if (this.sampleMediaBtn) {
      this.sampleMediaBtn.addEventListener('click', () => {
        this.createSampleMedia();
      });
    }

    this.state.on('media:changed', () => this.render());
  }

  async handleFiles(files) {
    for (const file of Array.from(files)) {
      const type = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : file.type.startsWith('image/')
        ? 'image'
        : null;

      if (!type) continue;

      const url = URL.createObjectURL(file);
      const mediaItem = {
        id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name: file.name,
        type,
        file,
        url,
        duration: 5,
        thumbnail: ''
      };

      if (type === 'video') {
        await this.loadVideoMetadata(mediaItem);
      } else if (type === 'audio') {
        await this.loadAudioMetadata(mediaItem);
      } else if (type === 'image') {
        mediaItem.duration = 4;
        mediaItem.thumbnail = url;
      }

      this.state.addMedia(mediaItem);

      // Auto add first video/audio to timeline if timeline is empty
      if (this.state.tracks.videoTrack.clips.length === 0 && (type === 'video' || type === 'image')) {
        // Smart aspect ratio detection: if video is vertical, switch to 9:16 automatically!
        if (mediaItem.width && mediaItem.height && mediaItem.height > mediaItem.width) {
          this.state.setAspectRatio('9:16');
          const aspectSelect = document.getElementById('select-aspect-ratio');
          if (aspectSelect) aspectSelect.value = '9:16';
        }

        this.state.addClipToTrack('videoTrack', {
          mediaId: mediaItem.id,
          name: mediaItem.name,
          type: mediaItem.type,
          duration: mediaItem.duration,
          mediaDuration: mediaItem.duration
        });
      }
    }
  }

  loadVideoMetadata(mediaItem) {
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.src = mediaItem.url;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        mediaItem.duration = video.duration || 5;
        mediaItem.width = video.videoWidth || 1920;
        mediaItem.height = video.videoHeight || 1080;

        // Capture thumbnail at 0.5s
        video.currentTime = Math.min(0.5, mediaItem.duration / 2);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, 160, 90);
          mediaItem.thumbnail = canvas.toDataURL('image/jpeg', 0.7);
        } catch (e) {
          mediaItem.thumbnail = '';
        }
        resolve(mediaItem);
      };

      video.onerror = () => {
        mediaItem.duration = 5;
        resolve(mediaItem);
      };
    });
  }

  loadAudioMetadata(mediaItem) {
    return new Promise(resolve => {
      const audio = new Audio();
      audio.src = mediaItem.url;
      audio.onloadedmetadata = () => {
        mediaItem.duration = audio.duration || 10;
        resolve(mediaItem);
      };
      audio.onerror = () => {
        mediaItem.duration = 10;
        resolve(mediaItem);
      };
    });
  }

  createSampleMedia() {
    // Generate an instant high-resolution 1080p cinematic sample clip
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // Draw rich gradient background
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Decorative cinematic grid / glowing aura
    const radGrad = ctx.createRadialGradient(960, 540, 100, 960, 540, 600);
    radGrad.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Center badge
    ctx.save();
    ctx.fillStyle = '#00f2fe';
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎬 CAPCUT MINI STUDIO', 960, 480);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
    ctx.fillText('Clip mẫu thử nghiệm · 100% Free · 0 Watermark', 960, 560);

    // Time tag
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 28px -apple-system, sans-serif';
    ctx.fillText('⏱️ Thời lượng: 6.0 giây · Kéo Playhead hoặc bấm S để cắt clip', 960, 630);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    const mediaItem = {
      id: 'media_sample_' + Date.now(),
      name: 'Clip_Mau_CapCut_Mini.png',
      type: 'image',
      url: dataUrl,
      duration: 6,
      thumbnail: dataUrl
    };

    this.state.addMedia(mediaItem);

    // Add sample video/image clip
    this.state.addClipToTrack('videoTrack', {
      mediaId: mediaItem.id,
      name: mediaItem.name,
      type: 'image',
      startTime: 0,
      duration: 6,
      mediaDuration: 6
    });

    // Add sample Title text
    this.state.addClipToTrack('textTrack', {
      text: 'CHÀO MỪNG ĐẾN VỚI CAPCUT MINI 🔥',
      fontSize: 54,
      color: '#facc15',
      strokeColor: '#000000',
      strokeWidth: 4,
      bgColor: 'rgba(0, 0, 0, 0.65)',
      startTime: 0.5,
      duration: 4.5,
      x: 0.5,
      y: 0.25
    });

    // Seek to 1s to view immediately
    this.state.seek(1.0);
  }

  render() {
    if (!this.mediaGrid) return;
    this.mediaGrid.innerHTML = '';

    if (this.state.mediaLibrary.length === 0) {
      this.mediaGrid.innerHTML = `
        <div style="grid-column: span 2; text-align: center; color: var(--text-muted); font-size: 11px; padding: 20px 0;">
          Chưa có tệp nào. Kéo thả video hoặc bấm nút Tạo clip mẫu ở trên!
        </div>
      `;
      return;
    }

    this.state.mediaLibrary.forEach(item => {
      const card = document.createElement('div');
      card.className = 'media-card';

      let thumbHtml = '';
      if (item.type === 'video' || item.type === 'image') {
        thumbHtml = item.thumbnail 
          ? `<img src="${item.thumbnail}" class="media-thumb" />`
          : `<div class="media-thumb" style="display:flex;align-items:center;justify-content:center;background:#181820;color:#666;">🎬 Video</div>`;
      } else {
        thumbHtml = `<div class="media-thumb" style="display:flex;align-items:center;justify-content:center;background:#0d3d38;color:#2dd4bf;font-size:24px;">🎵</div>`;
      }

      card.innerHTML = `
        ${thumbHtml}
        <div class="media-info">
          <div class="media-title" title="${item.name}">${item.name}</div>
          <div class="media-duration">${item.duration.toFixed(1)}s · ${item.type.toUpperCase()}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        const trackType = item.type === 'audio' ? 'audioTrack' : 'videoTrack';
        this.state.addClipToTrack(trackType, {
          mediaId: item.id,
          name: item.name,
          type: item.type,
          duration: item.duration,
          mediaDuration: item.duration
        });
      });

      this.mediaGrid.appendChild(card);
    });
  }
}

window.MediaManagerComponent = MediaManagerComponent;
