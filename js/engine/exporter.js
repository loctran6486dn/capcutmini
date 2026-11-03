/**
 * CapCut Mini - Video Export Engine
 * 100% Free, Client-side Hardware Accelerated, Zero Watermark
 */

class VideoExporter {
  constructor(state, renderer, audioMixer) {
    this.state = state;
    this.renderer = renderer;
    this.audioMixer = audioMixer;
    this.isExporting = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  getBestMimeType(resolution = '1080p') {
    const res = (resolution || '1080p').toLowerCase();
    const is4K = res === '4k' || res === '2160p';
    const is2K = res === '2k' || res === '1440p';
    const is1080p = res === '1080p';

    let candidates = [];
    if (is4K) {
      candidates = [
        'video/mp4;codecs=avc1.640033,mp4a.40.2',
        'video/mp4;codecs=avc1.4d4033,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
    } else if (is2K) {
      candidates = [
        'video/mp4;codecs=avc1.640032,mp4a.40.2',
        'video/mp4;codecs=avc1.4d4032,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
    } else if (is1080p) {
      candidates = [
        'video/mp4;codecs=avc1.640028,mp4a.40.2',
        'video/mp4;codecs=avc1.4d4028,mp4a.40.2',
        'video/mp4;codecs=avc1.4d401f,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=h264,opus',
        'video/webm'
      ];
    } else {
      candidates = [
        'video/mp4;codecs=avc1.4d401f,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];
    }

    for (const mime of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return 'video/webm';
  }

  async exportProject(options = {}, onProgress = () => {}) {
    if (this.isExporting) return;
    this.isExporting = true;
    if (this.renderer) {
      this.renderer.isExporting = true;
    }

    // Pause current preview
    this.state.pause();
    const originalTime = this.state.currentTime;

    // Pre-create and unlock audio elements within user interaction context
    await this.audioMixer.prepareExport();

    let targetHeight = 1080;
    const res = (options.resolution || '1080p').toLowerCase();
    if (res === '4k' || res === '2160p') {
      targetHeight = 2160;
    } else if (res === '2k' || res === '1440p') {
      targetHeight = 1440;
    } else if (res === '720p') {
      targetHeight = 720;
    } else {
      targetHeight = 1080;
    }

    let targetWidth = Math.round(targetHeight * (this.state.project.width / this.state.project.height));
    // Ensure even dimensions required by hardware encoders (H.264 / VP8 / VP9)
    if (targetWidth % 2 !== 0) targetWidth += 1;
    if (targetHeight % 2 !== 0) targetHeight += 1;

    const fps = 30;
    const totalDuration = this.state.duration;

    // Create offscreen canvas for rendering
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportCtx = exportCanvas.getContext('2d');

    // Pre-seek and pre-render initial frame at 0s so canvas is ready before recording starts
    this.renderer.syncActiveVideos(false, 0);
    this.renderer.renderFrame(0, exportCanvas, exportCtx, { allowSeek: true });
    await new Promise(r => setTimeout(r, 60));
    this.renderer.renderFrame(0, exportCanvas, exportCtx, { allowSeek: false });

    // Create combined stream with both video and mixed audio tracks
    const canvasStream = exportCanvas.captureStream(fps);
    const audioStream = this.audioMixer.getAudioDestinationStream();

    const tracks = [...canvasStream.getVideoTracks()];
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      tracks.push(audioStream.getAudioTracks()[0]);
    }
    const combinedStream = new MediaStream(tracks);

    const mimeType = this.getBestMimeType(res);
    const isMp4 = mimeType.includes('mp4');
    const extension = isMp4 ? 'mp4' : 'webm';

    // Mobile-safe bitrates conforming to H.264 hardware decoder DPB specs
    let defaultBitrate = 7000000;
    if (targetHeight >= 2160) {
      defaultBitrate = 18000000; // 18 Mbps for 4K Ultra HD (optimal mobile hardware decoding)
    } else if (targetHeight >= 1440) {
      defaultBitrate = 12000000; // 12 Mbps for 2K Quad HD (optimal mobile hardware decoding)
    } else if (targetHeight >= 1080) {
      defaultBitrate = 7000000;  // 7 Mbps for 1080p Full HD
    } else {
      defaultBitrate = 3500000;  // 3.5 Mbps for 720p HD
    }

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.bitrate || defaultBitrate
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    const cleanupExport = () => {
      this.isExporting = false;
      if (this.renderer) {
        this.renderer.isExporting = false;
        this.renderer.syncActiveVideos(false);
      }
      this.audioMixer.finishExport();
    };

    this.isCancelled = false;

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = () => {
        try {
          if (this.isCancelled) {
            cleanupExport();
            this.state.seek(originalTime);
            reject(new Error('Export was cancelled by user'));
            return;
          }

          const blob = new Blob(this.recordedChunks, { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          const cleanName = (this.state.project.name || 'CapCut_Mini_Export')
            .replace(/[^a-zA-Z0-9_\-]/g, '_');
          a.download = `${cleanName}.${extension}`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 2000);

          // Restore state
          this.state.seek(originalTime);
          cleanupExport();
          resolve({ success: true, blob, extension });
        } catch (err) {
          cleanupExport();
          reject(err);
        }
      };

      this.mediaRecorder.start(200);

      // Render timeline in real time for recorder sync with target fps throttling
      let currentTime = 0;
      const startTime = performance.now();
      const frameIntervalMs = 1000 / fps; // 33.33ms
      let lastFrameExportTime = startTime - frameIntervalMs;

      // Start initial playback sync at 0
      this.audioMixer.syncPlayback(true, 0);
      this.renderer.syncActiveVideos(true, 0);

      const renderStep = () => {
        if (!this.isExporting) {
          if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
          }
          return;
        }

        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        currentTime = Math.min(elapsed, totalDuration);

        // Keep AudioMixer in exact lockstep with export currentTime
        this.audioMixer.syncPlayback(true, currentTime);

        // Keep Renderer video elements continuously playing and synchronized (hardware accelerated, no seek thrashing)
        this.renderer.syncActiveVideos(true, currentTime);

        // Throttle 4K / 2K offscreen canvas rendering to target 30 fps (avoids GPU overload and dropped frames on 60Hz/120Hz displays)
        const timeSinceLastFrame = now - lastFrameExportTime;
        if (timeSinceLastFrame >= (frameIntervalMs - 3) || currentTime >= totalDuration) {
          lastFrameExportTime = now;
          this.renderer.renderFrame(currentTime, exportCanvas, exportCtx, { allowSeek: false });
        }

        // Calculate progress percentage
        const progress = Math.min(100, Math.round((currentTime / totalDuration) * 100));
        onProgress({
          percentage: progress,
          currentTime,
          totalDuration
        });

        if (currentTime >= totalDuration) {
          setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
              this.mediaRecorder.stop();
            }
          }, 300);
        } else {
          requestAnimationFrame(renderStep);
        }
      };

      requestAnimationFrame(renderStep);
    });
  }

  cancelExport() {
    if (this.isExporting) {
      this.isCancelled = true;
      this.isExporting = false;
      if (this.renderer) {
        this.renderer.isExporting = false;
        this.renderer.syncActiveVideos(false);
      }
      this.audioMixer.finishExport();
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    }
  }
}

window.VideoExporter = VideoExporter;
