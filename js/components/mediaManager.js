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
    // Dropzone / File Picker binding
    if (this.dropzone && this.fileInput) {
      // Keyboard support for label dropzone
      this.dropzone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.fileInput.click();
        }
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
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFiles(e.dataTransfer.files);
        }
      });

      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFiles(e.target.files);
          e.target.value = ''; // Always clear so selecting same file or new files always triggers change
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
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    for (const file of fileList) {
      try {
        let type = null;
        const mime = (file.type || '').toLowerCase();
        const ext = (file.name || '').split('.').pop().toLowerCase();
        const videoExts = ['mp4', 'mov', 'webm', 'm4v', '3gp', 'mkv', 'avi', 'ts', 'ogv', 'wmv'];
        const audioExts = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'wma', 'opus'];
        const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'svg'];

        if (mime.startsWith('video/') || videoExts.includes(ext)) {
          type = 'video';
        } else if (mime.startsWith('audio/') || audioExts.includes(ext)) {
          type = 'audio';
        } else if (mime.startsWith('image/') || imageExts.includes(ext)) {
          type = 'image';
        } else {
          // Default fallback to video for video editor
          type = 'video';
        }

        const url = URL.createObjectURL(file);
        const mediaItem = {
          id: 'media_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
          name: file.name || ('Media_' + Date.now()),
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

        // Smart aspect ratio detection for the very first video
        if (this.state.tracks.videoTrack.clips.length === 0 && (type === 'video' || type === 'image')) {
          if (mediaItem.width && mediaItem.height && mediaItem.height > mediaItem.width) {
            this.state.setAspectRatio('9:16');
            const aspectSelect = document.getElementById('select-aspect-ratio');
            if (aspectSelect) aspectSelect.value = '9:16';
          }
        }

        // Add EVERY selected video/image directly to Video Track sequentially
        if (type === 'video' || type === 'image') {
          this.state.addClipToTrack('videoTrack', {
            mediaId: mediaItem.id,
            name: mediaItem.name,
            type: mediaItem.type,
            duration: mediaItem.duration,
            mediaDuration: mediaItem.duration
          });
        } else if (type === 'audio') {
          this.state.addClipToTrack('audioTrack', {
            mediaId: mediaItem.id,
            name: mediaItem.name,
            type: 'audio',
            duration: mediaItem.duration,
            mediaDuration: mediaItem.duration
          });
        }
      } catch (err) {
        console.error('Error adding file to timeline:', file, err);
      }
    }

    // Rewind to 0s so user can preview from the beginning
    this.state.seek(0);
  }

  loadVideoMetadata(mediaItem) {
    return new Promise(resolve => {
      let resolved = false;
      let seekTimer = null;

      const done = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(hardTimeout);
          if (seekTimer) clearTimeout(seekTimer);
          cleanup();
          resolve(mediaItem);
        }
      };

      // 1.5s hard safety timeout: Guaranteed to resolve so media pipeline never freezes on iOS/mobile
      const hardTimeout = setTimeout(() => {
        if (!mediaItem.duration || isNaN(mediaItem.duration) || mediaItem.duration <= 0) {
          mediaItem.duration = 5;
        }
        if (!mediaItem.width) mediaItem.width = 1920;
        if (!mediaItem.height) mediaItem.height = 1080;
        done();
      }, 1500);

      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
      };

      video.onloadedmetadata = () => {
        mediaItem.duration = (video.duration && !isNaN(video.duration) && video.duration > 0) ? video.duration : 5;
        mediaItem.width = video.videoWidth || 1920;
        mediaItem.height = video.videoHeight || 1080;

        // Attempt thumbnail generation with quick 400ms timeout
        seekTimer = setTimeout(() => {
          done();
        }, 400);

        try {
          video.currentTime = Math.min(0.5, (mediaItem.duration || 5) / 2);
        } catch (e) {
          done();
        }
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
        done();
      };

      video.onerror = () => {
        mediaItem.duration = 5;
        mediaItem.width = 1920;
        mediaItem.height = 1080;
        done();
      };

      video.src = mediaItem.url;
      try {
        video.load();
      } catch (e) {}
    });
  }

  loadAudioMetadata(mediaItem) {
    return new Promise(resolve => {
      let resolved = false;

      const done = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(hardTimeout);
          audio.onloadedmetadata = null;
          audio.onerror = null;
          resolve(mediaItem);
        }
      };

      const hardTimeout = setTimeout(() => {
        if (!mediaItem.duration || isNaN(mediaItem.duration) || mediaItem.duration <= 0) {
          mediaItem.duration = 10;
        }
        done();
      }, 1500);

      const audio = new Audio();
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        mediaItem.duration = (audio.duration && !isNaN(audio.duration) && audio.duration > 0) ? audio.duration : 10;
        done();
      };

      audio.onerror = () => {
        mediaItem.duration = 10;
        done();
      };

      audio.src = mediaItem.url;
      try {
        audio.load();
      } catch (e) {}
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
