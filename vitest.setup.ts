import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  // Keep unit tests isolated: several vendored QCut tests assume mocks are cleared
  // between tests (as they are in the upstream repo).
  vi.clearAllMocks();
});

// Some QCut tests expect "blob:" URLs (not arbitrary strings).
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
}

if (!globalThis.URL.revokeObjectURL) {
  globalThis.URL.revokeObjectURL = vi.fn();
}

// matchMedia is used by Radix / responsive hooks in the QCut UI.
if (typeof (globalThis as any).matchMedia === 'undefined') {
  (globalThis as any).matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as any;
}
