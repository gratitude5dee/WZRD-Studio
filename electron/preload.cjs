const { contextBridge, ipcRenderer } = require("electron");

function normalizeDeepLinkPath(path) {
  return String(path || "").replace(/^\/+/, "").replace(/\/+$/, "");
}

contextBridge.exposeInMainWorld("wzrdDesktop", {
  isDesktop: true,
  platform: process.platform,
  openExternal: (url) => ipcRenderer.invoke("wzrd:open-external", url),
  getDeepLink: (path) => `wzrd://${normalizeDeepLinkPath(path)}`,
  selectVideoFile: () => ipcRenderer.invoke("wzrd:clip-studio:select-video-file"),
  selectLogoFile: () => ipcRenderer.invoke("wzrd:clip-studio:select-logo-file"),
  selectImageFiles: () => ipcRenderer.invoke("wzrd:clip-studio:select-image-files"),
  selectExportFolder: () => ipcRenderer.invoke("wzrd:clip-studio:select-export-folder"),
  revealInFinder: (filePath) => ipcRenderer.invoke("wzrd:clip-studio:reveal-in-finder", filePath),
  resolveMediaFileUrl: (params) => ipcRenderer.invoke("wzrd:clip-studio:resolve-media-file-url", params),
  cacheRemoteMedia: (params) => ipcRenderer.invoke("wzrd:media:cache-remote", params),
  validateFfmpegAvailable: (params) => ipcRenderer.invoke("wzrd:clip-studio:validate-ffmpeg", params),
  getVideoMetadata: (params) => ipcRenderer.invoke("wzrd:clip-studio:get-video-metadata", params),
  cutClip: (params) => ipcRenderer.invoke("wzrd:clip-studio:cut-clip", params),
  exportVerticalClip: (params) => ipcRenderer.invoke("wzrd:clip-studio:export-vertical-clip", params),
  generateThumbnail: (params) => ipcRenderer.invoke("wzrd:clip-studio:generate-thumbnail", params),
  validateMediaToolchain: (params) => ipcRenderer.invoke("wzrd:media:validate-toolchain", params),
  probeMedia: (params) => ipcRenderer.invoke("wzrd:media:probe", params),
  cutMedia: (params) => ipcRenderer.invoke("wzrd:media:cut", params),
  extractThumbnail: (params) => ipcRenderer.invoke("wzrd:media:extract-thumbnail", params),
  extractWaveformPeaks: (params) => ipcRenderer.invoke("wzrd:media:extract-waveform-peaks", params),
  renderPreviewProxy: (params) => ipcRenderer.invoke("wzrd:media:render-preview-proxy", params),
  renderTimeline: (params) => ipcRenderer.invoke("wzrd:media:render-timeline", params),
  runStudioMediaAction: (params) => ipcRenderer.invoke("wzrd:media:run-studio-action", params),
  validateYoutubeDownloaderAvailable: (params) => ipcRenderer.invoke("wzrd:clip-studio:validate-youtube-downloader", params),
  downloadYoutubeVideo: (params) => ipcRenderer.invoke("wzrd:clip-studio:download-youtube-video", params),
  extractRepresentativeFrames: (params) => ipcRenderer.invoke("wzrd:clip-studio:extract-representative-frames", params),
  onFfmpegProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("wzrd:clip-studio:ffmpeg-progress", listener);
    return () => ipcRenderer.removeListener("wzrd:clip-studio:ffmpeg-progress", listener);
  },
  onMediaProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("wzrd:media:progress", listener);
    return () => ipcRenderer.removeListener("wzrd:media:progress", listener);
  },
  onYoutubeDownloadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("wzrd:clip-studio:youtube-download-progress", listener);
    return () => ipcRenderer.removeListener("wzrd:clip-studio:youtube-download-progress", listener);
  },
});


// ---------------------------------------------------------------------------
// QCut Bridge (Phase 3+) — namespaced ipcMain handlers
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld("wzrdQcut", {
  ffmpeg: {
    getPath: () => ipcRenderer.invoke("wzrd:qcut:ffmpeg:get-path"),
    checkHealth: () => ipcRenderer.invoke("wzrd:qcut:ffmpeg:check-health"),
    createExportSession: () => ipcRenderer.invoke("wzrd:qcut:ffmpeg:create-export-session"),
    saveFrame: (params) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:save-frame", params),
    saveStickerForExport: (params) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:save-sticker-for-export", params),
    exportVideoCLI: (options) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:export-video-cli", options),
    readOutputFile: (filePath) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:read-output-file", filePath),
    cleanupExportSession: (sessionId) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:cleanup-export-session", sessionId),
    openFramesFolder: (sessionId) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:open-frames-folder", sessionId),
    extractAudio: (params) => ipcRenderer.invoke("wzrd:qcut:ffmpeg:extract-audio", params),
  },
  files: {
    getFileInfo: (filePath) => ipcRenderer.invoke("wzrd:qcut:files:get-file-info", filePath),
  },
  audio: {
    saveTemp: (params) => ipcRenderer.invoke("wzrd:qcut:audio:save-temp", params),
  },
  video: {
    saveTemp: (params) => ipcRenderer.invoke("wzrd:qcut:video:save-temp", params),
    verifyFile: (filePath) => ipcRenderer.invoke("wzrd:qcut:video:verify-file", filePath),
  },
  pty: {
    spawn: (options) => ipcRenderer.invoke("wzrd:qcut:pty:spawn", options),
    write: (sessionId, data) => ipcRenderer.invoke("wzrd:qcut:pty:write", { sessionId, data }),
    resize: (sessionId, cols, rows) => ipcRenderer.invoke("wzrd:qcut:pty:resize", { sessionId, cols, rows }),
    kill: (sessionId) => ipcRenderer.invoke("wzrd:qcut:pty:kill", { sessionId }),
    killAll: () => ipcRenderer.invoke("wzrd:qcut:pty:kill-all"),
    onData: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("wzrd:qcut:pty:data", listener);
      return () => ipcRenderer.removeListener("wzrd:qcut:pty:data", listener);
    },
    onExit: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("wzrd:qcut:pty:exit", listener);
      return () => ipcRenderer.removeListener("wzrd:qcut:pty:exit", listener);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("wzrd:qcut:pty:data");
      ipcRenderer.removeAllListeners("wzrd:qcut:pty:exit");
    },
  },
  projectFolder: {
    getRoot: (projectId) => ipcRenderer.invoke("wzrd:qcut:project-folder:get-root", { projectId }),
    list: (projectId, subPath) => ipcRenderer.invoke("wzrd:qcut:project-folder:list", { projectId, subPath }),
    scan: (projectId, subPath, options) => ipcRenderer.invoke("wzrd:qcut:project-folder:scan", { projectId, subPath, options }),
    ensureStructure: (projectId) => ipcRenderer.invoke("wzrd:qcut:project-folder:ensure-structure", { projectId }),
  },
  skills: {
    list: (projectId) => ipcRenderer.invoke("wzrd:qcut:skills:list", { projectId }),
    import: (projectId, sourcePath) => ipcRenderer.invoke("wzrd:qcut:skills:import", { projectId, sourcePath }),
    delete: (projectId, skillId) => ipcRenderer.invoke("wzrd:qcut:skills:delete", { projectId, skillId }),
    getContent: (projectId, skillId, filename) => ipcRenderer.invoke("wzrd:qcut:skills:get-content", { projectId, skillId, filename }),
    browse: () => ipcRenderer.invoke("wzrd:qcut:skills:browse"),
    getPath: (projectId) => ipcRenderer.invoke("wzrd:qcut:skills:get-path", { projectId }),
    scanGlobal: () => ipcRenderer.invoke("wzrd:qcut:skills:scan-global"),
    syncForClaude: (projectId) => ipcRenderer.invoke("wzrd:qcut:skills:sync-for-claude", { projectId }),
  },
  mcp: {
    getInfo: () => ipcRenderer.invoke("wzrd:qcut:mcp:get-info"),
    onAppHtml: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("wzrd:qcut:mcp:app-html", listener);
      return () => ipcRenderer.removeListener("wzrd:qcut:mcp:app-html", listener);
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners("wzrd:qcut:mcp:app-html");
    },
  },
  agentCommand: {
    notifyReady: (payload) => ipcRenderer.send("wzrd:qcut:agent:ready", payload),
    onRequest: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on("wzrd:qcut:agent-command", listener);
      return () => ipcRenderer.removeListener("wzrd:qcut:agent-command", listener);
    },
    respond: (payload) => ipcRenderer.send("wzrd:qcut:agent-command:response", payload),
    removeListeners: () => {
      ipcRenderer.removeAllListeners("wzrd:qcut:agent-command");
    },
  },

});
