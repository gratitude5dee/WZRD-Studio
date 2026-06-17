export interface ClipperExportReadinessInput {
  sourceReady: boolean;
  exportFolderReady: boolean;
  ffmpegReady: boolean;
  includedCount: number;
  brandLogoPath?: string;
  brandLogoUrl?: string;
  isBrandLogoResolving?: boolean;
}

export interface ClipperExportReadiness {
  exportReady: boolean;
  canClickExport: boolean;
  logoUsable: boolean;
  logoWarning?: string;
  hardBlockers: string[];
}

function hasValue(value?: string): boolean {
  return Boolean(value?.trim());
}

export function buildClipperExportReadiness(input: ClipperExportReadinessInput): ClipperExportReadiness {
  const hardBlockers: string[] = [];

  if (!input.sourceReady) hardBlockers.push('Source');
  if (!input.ffmpegReady) hardBlockers.push('ffmpeg');
  if (!input.exportFolderReady) hardBlockers.push('Export folder');
  if (input.includedCount <= 0) hardBlockers.push('Included clips');

  const hasLogoPath = hasValue(input.brandLogoPath);
  const logoUsable = hasLogoPath && hasValue(input.brandLogoUrl);
  const logoWarning = hasLogoPath && !logoUsable && !input.isBrandLogoResolving
    ? 'Logo unavailable; export will run unbranded until you re-upload.'
    : undefined;

  return {
    exportReady: hardBlockers.length === 0,
    canClickExport: input.sourceReady && input.includedCount > 0,
    logoUsable,
    logoWarning,
    hardBlockers,
  };
}

export function getUsableBrandLogoPath(params: {
  verticalExport: boolean;
  brandLogoPath?: string;
  brandLogoUrl?: string;
}): string | undefined {
  if (!params.verticalExport) return undefined;
  return hasValue(params.brandLogoPath) && hasValue(params.brandLogoUrl)
    ? params.brandLogoPath
    : undefined;
}
