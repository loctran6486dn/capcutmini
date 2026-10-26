/**
 * CapCut Mini - State Management & Event Bus
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(listener => {
        try {
          listener(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      });
    }
  }
}

class AppState extends EventEmitter {
  constructor() {
    super();

    // Project Configurations
    this.project = {
      name: 'CapCut Mini Project',
      aspectRatio: '16:9',
      width: 1920,
      height: 1080,
      fps: 30
    };

    // Tracks structure
    this.tracks = {
      textTrack: {
        id: 'text-track',
        type: 'text',
        name: 'Văn bản (Text)',
        clips: []
      },
      videoTrack: {
        id: 'video-track',
        type: 'video',
        name: 'Video chính',
        clips: []
      },
      audioTrack: {
        id: 'audio-track',
        type: 'audio',
        name: 'Âm thanh (BGM)',
        clips: []
      }
    };

    // Library of imported media files
    this.mediaLibrary = [];

    // Playback state
    this.currentTime = 0;
    this.isPlaying = false;
    this.duration = 0;
    this.zoom = 50; // pixels per second on timeline

    // Selection
    this.selectedClip = null; // { trackType: 'video'|'text'|'audio', clipId: string }

    // History for Undo / Redo
    this.historyStack = [];
    this.redoStack = [];
    this.maxHistory = 30;
  }

  // --- Aspect Ratio & Resolution ---
  setAspectRatio(ratio) {
    this.pushHistory('Đổi tỉ lệ khung hình');
    this.project.aspectRatio = ratio;
    switch (ratio) {
      case '9:16':
        this.project.width = 1080;
        this.project.height = 1920;
        break;
      case '1:1':
        this.project.width = 1080;
        this.project.height = 1080;
        break;
      case '4:5':
        this.project.width = 1080;
        this.project.height = 1350;
        break;
      case '16:9':
      default:
        this.project.width = 1920;
        this.project.height = 1080;
        break;
    }
    this.emit('project:changed', this.project);
  }

  // --- Media Library ---
  addMedia(mediaItem) {
    this.mediaLibrary.push(mediaItem);
    this.emit('media:added', mediaItem);
    this.emit('media:changed', this.mediaLibrary);
  }

  getMedia(id) {
    return this.mediaLibrary.find(m => m.id === id);
  }

  // --- Duration Calculation ---
  recalculateDuration() {
    let maxEnd = 0;
    Object.values(this.tracks).forEach(track => {
      track.clips.forEach(clip => {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd > maxEnd) maxEnd = clipEnd;
      });
    });
    this.duration = Math.max(maxEnd, 5); // default min 5s
    this.emit('duration:changed', this.duration);
  }

  // --- Clip Operations ---
  addClipToTrack(trackType, clipData) {
    this.pushHistory('Thêm clip vào timeline');
    const track = this.tracks[trackType];
    if (!track) return null;

    // Automatic placement right after existing clips if startTime is not explicitly set
    let start = clipData.startTime;
    if (start === undefined || start === null) {
      start = 0;
      if (track.clips.length > 0) {
        const lastClip = track.clips[track.clips.length - 1];
        start = lastClip.startTime + lastClip.duration;
      }
    }

    const newClip = {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: clipData.name || 'Clip',
      mediaId: clipData.mediaId || null,
      type: clipData.type || (trackType === 'textTrack' ? 'text' : trackType === 'audioTrack' ? 'audio' : 'video'),
      startTime: Math.max(0, start),
      duration: clipData.duration || 5,
      mediaDuration: clipData.mediaDuration || clipData.duration || 5,
      trimStart: clipData.trimStart || 0,
      trimEnd: clipData.trimEnd || 0,
      speed: clipData.speed || 1.0,
      volume: clipData.volume !== undefined ? clipData.volume : 1.0,
      filters: clipData.filters || {
        brightness: 100,
        contrast: 100,
        saturate: 100,
        grayscale: 0,
        sepia: 0,
        blur: 0
      },
      // For Text clips
      text: clipData.text || 'Nhập văn bản ở đây',
      fontSize: clipData.fontSize || 42,
      fontFamily: clipData.fontFamily || 'Arial, sans-serif',
      color: clipData.color || '#ffffff',
      bgColor: clipData.bgColor || 'transparent',
      strokeColor: clipData.strokeColor || '#000000',
      strokeWidth: clipData.strokeWidth || 3,
      x: clipData.x !== undefined ? clipData.x : 0.5, // normalized 0 to 1
      y: clipData.y !== undefined ? clipData.y : 0.8
    };

    track.clips.push(newClip);
    // Sort clips chronologically
    track.clips.sort((a, b) => a.startTime - b.startTime);

    this.recalculateDuration();
    this.selectClip(trackType, newClip.id);
    this.emit('tracks:changed', this.tracks);
    return newClip;
  }

  updateClip(trackType, clipId, updates) {
    const track = this.tracks[trackType];
    if (!track) return;
    const clipIndex = track.clips.findIndex(c => c.id === clipId);
    if (clipIndex === -1) return;

    this.pushHistory('Chỉnh sửa clip');
    track.clips[clipIndex] = { ...track.clips[clipIndex], ...updates };
    
    // re-sort if startTime changed
    if (updates.startTime !== undefined) {
      track.clips.sort((a, b) => a.startTime - b.startTime);
    }

    this.recalculateDuration();
    this.emit('clip:updated', { trackType, clip: track.clips[clipIndex] });
    this.emit('tracks:changed', this.tracks);
  }

  removeClip(trackType, clipId) {
    const track = this.tracks[trackType];
    if (!track) return;
    this.pushHistory('Xoá clip');
    track.clips = track.clips.filter(c => c.id !== clipId);

    if (this.selectedClip && this.selectedClip.clipId === clipId) {
      this.selectedClip = null;
      this.emit('clip:selected', null);
    }

    this.recalculateDuration();
    this.emit('tracks:changed', this.tracks);
  }

  selectClip(trackType, clipId) {
    if (!trackType || !clipId) {
      this.selectedClip = null;
    } else {
      const track = this.tracks[trackType];
      const clip = track ? track.clips.find(c => c.id === clipId) : null;
      this.selectedClip = clip ? { trackType, clipId, clip } : null;
    }
    this.emit('clip:selected', this.selectedClip);
  }

  getSelectedClip() {
    if (!this.selectedClip) return null;
    const track = this.tracks[this.selectedClip.trackType];
    if (!track) return null;
    return track.clips.find(c => c.id === this.selectedClip.clipId) || null;
  }

  // --- CapCut Split Operation ---
  splitClipAtCurrentTime() {
    if (!this.selectedClip) return false;
    const { trackType, clipId } = this.selectedClip;
    const track = this.tracks[trackType];
    const clip = track ? track.clips.find(c => c.id === clipId) : null;
    if (!clip) return false;

    // Check if playhead is strictly inside the clip
    const clipStart = clip.startTime;
    const clipEnd = clip.startTime + clip.duration;
    if (this.currentTime <= clipStart + 0.1 || this.currentTime >= clipEnd - 0.1) {
      return false; // not inside clip
    }

    this.pushHistory('Tách clip (Split)');
    const splitOffset = this.currentTime - clipStart; // duration of first half

    // Create 2nd clip
    const secondClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: clip.name + ' (phần 2)',
      startTime: this.currentTime,
      duration: clip.duration - splitOffset,
      trimStart: clip.trimStart + (splitOffset * (clip.speed || 1.0))
    };

    // Update 1st clip duration
    clip.duration = splitOffset;

    track.clips.push(secondClip);
    track.clips.sort((a, b) => a.startTime - b.startTime);

    this.selectClip(trackType, secondClip.id);
    this.recalculateDuration();
    this.emit('tracks:changed', this.tracks);
    return true;
  }

  // --- Duplicate Clip ---
  duplicateSelectedClip() {
    if (!this.selectedClip) return false;
    const { trackType, clipId } = this.selectedClip;
    const track = this.tracks[trackType];
    const clip = track ? track.clips.find(c => c.id === clipId) : null;
    if (!clip) return false;

    this.pushHistory('Nhân bản clip');
    const newClip = {
      ...JSON.parse(JSON.stringify(clip)),
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: clip.name + ' (Copy)',
      startTime: clip.startTime + clip.duration + 0.1
    };

    track.clips.push(newClip);
    track.clips.sort((a, b) => a.startTime - b.startTime);

    this.selectClip(trackType, newClip.id);
    this.recalculateDuration();
    this.emit('tracks:changed', this.tracks);
    return true;
  }

  // --- Timeline Zoom & Seeking ---
  setZoom(zoom) {
    this.zoom = Math.max(10, Math.min(250, zoom));
    this.emit('zoom:changed', this.zoom);
  }

  seek(time, options = { emit: true }) {
    this.currentTime = Math.max(0, Math.min(this.duration, time));
    if (options.emit) {
      this.emit('seek', this.currentTime);
    }
  }

  play() {
    if (this.currentTime >= this.duration) {
      this.seek(0);
    }
    this.isPlaying = true;
    this.emit('playback:play');
  }

  pause() {
    this.isPlaying = false;
    this.emit('playback:pause');
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  // --- Undo / Redo ---
  pushHistory(actionName) {
    const snapshot = JSON.stringify({
      tracks: this.tracks,
      project: this.project
    });
    this.historyStack.push({ name: actionName, snapshot });
    if (this.historyStack.length > this.maxHistory) {
      this.historyStack.shift();
    }
    this.redoStack = []; // clear redo on new action
  }

  undo() {
    if (this.historyStack.length === 0) return;
    const currentSnapshot = JSON.stringify({
      tracks: this.tracks,
      project: this.project
    });
    this.redoStack.push({ snapshot: currentSnapshot });

    const previous = this.historyStack.pop();
    const data = JSON.parse(previous.snapshot);
    this.tracks = data.tracks;
    this.project = data.project;

    this.recalculateDuration();
    this.selectClip(null, null);
    this.emit('tracks:changed', this.tracks);
    this.emit('project:changed', this.project);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const currentSnapshot = JSON.stringify({
      tracks: this.tracks,
      project: this.project
    });
    this.historyStack.push({ snapshot: currentSnapshot });

    const next = this.redoStack.pop();
    const data = JSON.parse(next.snapshot);
    this.tracks = data.tracks;
    this.project = data.project;

    this.recalculateDuration();
    this.selectClip(null, null);
    this.emit('tracks:changed', this.tracks);
    this.emit('project:changed', this.project);
  }
}

// Global Singleton
window.state = new AppState();
