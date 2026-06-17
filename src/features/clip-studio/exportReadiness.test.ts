import { describe, expect, it } from 'vitest';

import {
  buildClipperExportReadiness,
  getUsableBrandLogoPath,
} from './exportReadiness';

describe('Clipper export readiness', () => {
  it('does not block export when an optional saved logo cannot be previewed', () => {
    const readiness = buildClipperExportReadiness({
      sourceReady: true,
      exportFolderReady: true,
      ffmpegReady: true,
      includedCount: 3,
      brandLogoPath: '/Users/me/logo.png',
      brandLogoUrl: undefined,
    });

    expect(readiness.exportReady).toBe(true);
    expect(readiness.canClickExport).toBe(true);
    expect(readiness.logoUsable).toBe(false);
    expect(readiness.logoWarning).toMatch(/export will run unbranded/i);
    expect(readiness.hardBlockers).toEqual([]);
  });

  it('uses the logo only when the saved path has a resolved preview URL', () => {
    expect(getUsableBrandLogoPath({
      verticalExport: true,
      brandLogoPath: '/Users/me/logo.png',
      brandLogoUrl: 'wzrd://media/logo.png',
    })).toBe('/Users/me/logo.png');

    expect(getUsableBrandLogoPath({
      verticalExport: true,
      brandLogoPath: '/Users/me/logo.png',
      brandLogoUrl: undefined,
    })).toBeUndefined();
  });

  it('keeps the export action clickable so the handler can prompt for a missing folder', () => {
    const readiness = buildClipperExportReadiness({
      sourceReady: true,
      exportFolderReady: false,
      ffmpegReady: true,
      includedCount: 1,
    });

    expect(readiness.exportReady).toBe(false);
    expect(readiness.canClickExport).toBe(true);
    expect(readiness.hardBlockers).toContain('Export folder');
  });
});
