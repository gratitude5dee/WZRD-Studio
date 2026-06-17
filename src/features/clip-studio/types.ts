export type ClipStudioMode = 'viral' | 'auto';

export type ClipStudioSourceType = 'youtube' | 'local';

export type ClipStudioPlatformPreset = 'tiktok' | 'reels' | 'shorts' | 'multi';

export type YouTubeViewmapStatus = 'found' | 'unavailable' | 'fallback' | 'missing';

export interface YouTubeViewmapPoint {
  startSeconds: number;
  endSeconds: number;
  value: number;
  normalizedScore: number;
}

export interface YouTubeViewmapPeak {
  id: string;
  rank: number;
  peakSeconds: number;
  windowStartSeconds: number;
  windowEndSeconds: number;
  score: number;
  source: 'structured' | 'plateau';
}

export type AnalysisSignalStatusKind = 'ready' | 'missing' | 'fallback' | 'warning';

export interface AnalysisSignalStatus {
  id: string;
  label: string;
  status: AnalysisSignalStatusKind;
  detail: string;
  count?: number;
}

export type ClipCandidateSeedSource =
  | 'viewmap_peak'
  | 'manual_timestamp'
  | 'transcript_hook'
  | 'visual_frame'
  | 'screenshot_heatmap';

export interface ClipCandidateSeed {
  id: string;
  source: ClipCandidateSeedSource;
  startSeconds: number;
  endSeconds: number;
  anchorSeconds: number;
  score: number;
  evidenceLabels: ClipCandidateSeedSource[];
  evidenceSummary: string;
  transcriptExcerpt?: string;
  viewmapPeakRank?: number;
  viewmapScore?: number;
}

export interface AnalysisTranscriptWindow {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  reason: string;
}

export interface AnalysisContextPackage {
  generatedAt: string;
  summary: string;
  signals: AnalysisSignalStatus[];
  warnings: string[];
  viewmapPeaks: YouTubeViewmapPeak[];
  candidateSeeds: ClipCandidateSeed[];
  transcriptWindows: AnalysisTranscriptWindow[];
}

export interface VideoSource {
  id: string;
  type: ClipStudioSourceType;
  name: string;
  url?: string;
  localPath?: string;
  objectUrl?: string;
  creator?: string;
  importedAt: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  subtitlePath?: string;
  viewmap?: YouTubeViewmapPoint[];
  viewmapStatus?: YouTubeViewmapStatus;
  viewmapWarning?: string;
  status: 'empty' | 'ready' | 'unsupported' | 'error';
  warning?: string;
}

export interface TranscriptSegment {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence?: number;
}

export interface Transcript {
  language?: string;
  segments: TranscriptSegment[];
}

export interface ClipCandidate {
  id: string;
  sourceId: string;
  title: string;
  hook: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  score: number;
  reason: string;
  archetype: string;
  platformFit: ClipStudioPlatformPreset[];
  include: boolean;
  source: 'gmi' | 'auto' | 'manual' | 'timestamp';
  order: number;
  transcriptExcerpt?: string;
  signalBadges?: string[];
  viewmapScore?: number;
  viewmapPeakRank?: number;
  evidenceSummary?: string;
  confidence?: number;
  warnings: string[];
}

export interface ExportedClip {
  id: string;
  sourceId: string;
  candidateId: string;
  sourceName: string;
  sourceUrl?: string;
  creator?: string;
  title: string;
  hook: string;
  archetype: string;
  platformFit: ClipStudioPlatformPreset[];
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  score: number;
  exportPath: string;
  thumbnailPath?: string;
  captions?: string;
  transcriptExcerpt?: string;
  createdAt: string;
}

export interface GmiGeminiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  analysisPrompt: string;
  redactedDebugLogging: boolean;
  exportFolder: string;
  defaultMode: ClipStudioMode;
  defaultPlatformPreset: ClipStudioPlatformPreset;
  captionsDefault: boolean;
  ffmpegPathOverride: string;
  youtubeDownloaderPathOverride: string;
  brandLogoPath: string;
  brandLogoOpacity: number;
  brandLogoIntroSeconds: number;
}

export type AiAnalysisSettings = GmiGeminiSettings;

export interface HeatmapImageInput {
  id: string;
  name: string;
  dataUrl: string;
}

export interface RepresentativeFrameInput {
  id: string;
  name: string;
  timestampSeconds: number;
  dataUrl: string;
}

export interface UserTimestampInput {
  id: string;
  label: string;
  seconds: number;
}

export interface GmiClipAnalysisInput {
  source: VideoSource;
  settings: GmiGeminiSettings;
  transcript?: Transcript;
  analysisContext?: AnalysisContextPackage;
  viewmapPeaks?: YouTubeViewmapPeak[];
  candidateSeeds?: ClipCandidateSeed[];
  heatmapImages?: HeatmapImageInput[];
  frameImages?: RepresentativeFrameInput[];
  userTimestamps?: UserTimestampInput[];
  notes?: string;
}

export interface GmiClipAnalysisResult {
  sourceSummary: string;
  clipCandidates: ClipCandidate[];
  topFiveMustCut: string[];
  suggestedPostingOrder: string[];
  hookOverlaySuggestions: string[];
  editingStrategy: string;
  avoidLowPrioritySections: string[];
  confidenceNotes: string[];
  warnings: string[];
  rawJson: unknown;
}

export interface DesktopFileSelection {
  name: string;
  path: string;
  size?: number;
  mimeType?: string;
}

export interface DesktopVideoMetadata {
  durationSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  bitrate?: number;
  formatName?: string;
}

export interface DesktopFfmpegStatus {
  available: boolean;
  version?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  ffprobeAvailable?: boolean;
  diagnostics?: string[];
  error?: string;
}

export interface DesktopFfmpegProgress {
  operationId: string;
  stage: 'starting' | 'running' | 'completed' | 'failed';
  percent: number;
  timeSeconds?: number;
  clipTitle?: string;
  sourceName?: string;
  outputName?: string;
  message?: string;
  detail?: string;
  exitCode?: number;
  signal?: string;
  stderrTail?: string;
}

export interface DesktopYoutubeDownloadResult {
  id?: string;
  url: string;
  title: string;
  uploader?: string;
  localPath: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  subtitlePath?: string;
  subtitleText?: string;
  viewmap?: YouTubeViewmapPoint[];
  viewmapStatus?: YouTubeViewmapStatus;
  viewmapWarning?: string;
  size?: number;
}

export interface DesktopYoutubeDownloaderStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface DesktopYoutubeDownloadProgress {
  operationId: string;
  stage: 'starting' | 'downloading' | 'processing' | 'completed' | 'failed';
  percent: number;
  message?: string;
}
