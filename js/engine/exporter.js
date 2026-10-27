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

  getBestMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1.4d401f,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }
    return 'video/webm';
  }

  async exportProject(options = {}, onProgress = () => {}) {
    if (this.isExporting) return;
    this.isExporting = true;

    // Pause current preview
    this.state.pause();
    const originalTime = this.state.currentTime;

    const targetHeight = options.resolution === '720p' ? 720 : 1080;
    const targetWidth = Math.round(targetHeight * (this.state.project.width / this.state.project.height));
    const fps = 30;
    const totalDuration = this.state.duration;

    // Create offscreen canvas for rendering
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetWidth;
    exportCanvas.height = targetHeight;
    const exportCtx = exportCanvas.getContext('2d');

    // Create combined stream
    const canvasStream = exportCanvas.captureStream(fps);
    const audioStream = this.audioMixer.getAudioDestinationStream();

    const tracks = [...canvasStream.getVideoTracks()];
    if (audioStream && audioStream.getAudioTracks().length > 0) {
      tracks.push(audioStream.getAudioTracks()[0]);
    }
    const combinedStream = new MediaStream(tracks);

    const mimeType = this.getBestMimeType();
    const isMp4 = mimeType.includes('mp4');
    const extension = isMp4 ? 'mp4' : 'webm';

    this.recordedChunks = [];
    this.mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: options.bitrate || 6000000 // 6 Mbps
    });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    return new Promise((resolve, reject) => {
      this.mediaRecorder.onstop = () => {
        try {
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
          this.isExporting = false;
          this.audioMixer.isExporting = false;
          resolve({ success: true, blob, extension });
        } catch (err) {
          this.isExporting = false;
          this.audioMixer.isExporting = false;
          reject(err);
        }
      };

      this.mediaRecorder.start(200);

      // Render timeline in real time for recorder sync
      let currentTime = 0;
      const frameInterval = 1 / fps;
      const startTime = performance.now();

      // Ensure audio context is unmuted and active
      this.audioMixer.isExporting = true;
      this.audioMixer.ensureContext();
      this.audioMixer.syncPlayback(true);

      const renderStep = () => {
        if (!this.isExporting) {
          this.mediaRecorder.stop();
          return;
        }

        const now = performance.now();
        const elapsed = (now - startTime) / 1000;
        currentTime = Math.min(elapsed, totalDuration);

        // Seek internal audio & video elements
        this.renderer.renderFrame(currentTime, exportCanvas, exportCtx);

        // Calculate progress percentage
        const progress = Math.min(100, Math.round((currentTime / totalDuration) * 100));
        onProgress({
          percentage: progress,
          currentTime,
          totalDuration
        });

        if (currentTime >= totalDuration) {
          setTimeout(() => {
            this.mediaRecorder.stop();
            this.audioMixer.syncPlayback(false);
          }, 500);
        } else {
          requestAnimationFrame(renderStep);
        }
      };

      requestAnimationFrame(renderStep);
    });
  }

  cancelExport() {
    if (this.isExporting && this.mediaRecorder) {
      this.isExporting = false;
      this.audioMixer.isExporting = false;
      this.mediaRecorder.stop();
    }
  }
}

window.VideoExporter = VideoExporter;
