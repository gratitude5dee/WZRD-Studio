import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/components/landing/SplatIntroOverlay', () => ({
  default: ({ onComplete }: { onComplete: () => void }) => (
    <button type="button" onClick={onComplete}>
      Skip intro
    </button>
  ),
}));

import LandingIntroGate from '../LandingIntroGate';
import { SPLAT_INTRO_SEEN_KEY } from '@/components/landing/introGate';

const realCreateElement = document.createElement.bind(document);

const matchMediaMock = (matches: boolean) =>
  vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });

function mockWebGL2(available: boolean) {
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
    const element = realCreateElement(tag, options);
    if (tag === 'canvas') {
      (element as HTMLCanvasElement).getContext = ((id: string) =>
        available && id === 'webgl2' ? ({ getExtension: () => null } as unknown as WebGL2RenderingContext) : null) as typeof element.getContext;
    }
    return element;
  });
}

const manifest = {
  version: 1,
  id: 'intro',
  title: 'Intro',
  createdAt: 'x',
  provider: 'depth-anything-video',
  source: { videoUrl: 'rgb.mp4' },
  duration: 6,
  fps: 24,
  width: 1280,
  height: 720,
  camera: { fovDeg: 50, near: 1, far: 3 },
  track: { kind: 'rgbd', depthVideoUrl: 'depth.mp4', depthEncoding: 'inverse-gray8', grid: { cols: 320, rows: 180 }, keyframeCount: 24 },
};

beforeEach(() => {
  sessionStorage.clear();
  window.matchMedia = matchMediaMock(false) as unknown as typeof window.matchMedia;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 })));
  mockWebGL2(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.introActive;
  document.documentElement.style.overflow = '';
});

describe('LandingIntroGate', () => {
  it('renders children first, then swaps to the intro and back after completion', async () => {
    render(
      <LandingIntroGate>
        <div data-testid="hero">hero</div>
      </LandingIntroGate>,
    );
    await waitFor(() => expect(screen.getByTestId('landing-intro-gate')).toBeInTheDocument());
    expect(screen.queryByTestId('hero')).toBeNull();
    expect(document.documentElement.dataset.introActive).toBe('true');
    const skip = await screen.findByRole('button', { name: 'Skip intro' });
    act(() => {
      fireEvent.click(skip);
    });
    await waitFor(() => expect(screen.getByTestId('hero')).toBeInTheDocument());
    expect(screen.queryByTestId('landing-intro-gate')).toBeNull();
    expect(sessionStorage.getItem(SPLAT_INTRO_SEEN_KEY)).toBe('true');
    expect(document.documentElement.dataset.introActive).toBeUndefined();
  });

  it('leaves the page alone when reduced motion is preferred', async () => {
    window.matchMedia = matchMediaMock(true) as unknown as typeof window.matchMedia;
    render(
      <LandingIntroGate>
        <div data-testid="hero">hero</div>
      </LandingIntroGate>,
    );
    await act(async () => {});
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('leaves the page alone without WebGL2 or when the manifest is missing', async () => {
    mockWebGL2(false);
    const { unmount } = render(
      <LandingIntroGate>
        <div data-testid="hero">hero</div>
      </LandingIntroGate>,
    );
    await act(async () => {});
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    unmount();

    mockWebGL2(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    render(
      <LandingIntroGate>
        <div data-testid="hero2">hero</div>
      </LandingIntroGate>,
    );
    await waitFor(() => expect(screen.getByTestId('hero2')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('landing-intro-gate')).toBeNull());
  });

  it('does not replay within the same session', async () => {
    sessionStorage.setItem(SPLAT_INTRO_SEEN_KEY, 'true');
    render(
      <LandingIntroGate>
        <div data-testid="hero">hero</div>
      </LandingIntroGate>,
    );
    await act(async () => {});
    expect(screen.getByTestId('hero')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
