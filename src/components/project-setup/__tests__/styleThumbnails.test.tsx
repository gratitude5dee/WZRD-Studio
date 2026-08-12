import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { VIDEO_STYLES, getFeaturedVideoStyles } from '../videoStyles';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

vi.mock('@/services/supabaseService', () => ({
  supabaseService: {
    characters: { listByProject: () => Promise.resolve([]), create: () => Promise.resolve('c1'), delete: () => Promise.resolve() },
    scenes: { listByProject: () => Promise.resolve([]) },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('../ProjectContext', () => ({
  useProjectContext: () => ({ projectId: null, generationCompletedSignal: 0 }),
}));

import ProjectBriefTab from '../ProjectBriefTab';
import { VoiceSelectionProvider } from '@/voice/VoiceSelectionContext';

const PUBLIC_DIR = join(process.cwd(), 'public');

const renderBrief = () =>
  render(
    <VoiceSelectionProvider>
      <ProjectBriefTab
        projectData={{
          title: 'Test',
          concept: '',
          genre: '',
          tone: '',
          format: 'custom',
          addVoiceover: false,
          conceptOption: 'ai',
        }}
        updateProjectData={vi.fn()}
      />
    </VoiceSelectionProvider>,
  );

describe('style thumbnails', () => {
  it('every declared style has a real, non-empty asset on disk', () => {
    expect(VIDEO_STYLES.length).toBeGreaterThan(0);
    for (const style of VIDEO_STYLES) {
      const path = join(PUBLIC_DIR, style.thumbnail.replace(/^\//, ''));
      expect(existsSync(path), `${style.value}: missing ${style.thumbnail}`).toBe(true);
      expect(statSync(path).size, `${style.value}: empty ${style.thumbnail}`).toBeGreaterThan(0);
    }
  });

  it('renders a real thumbnail for every featured card, including "None"', () => {
    renderBrief();

    const featured = getFeaturedVideoStyles();
    expect(featured.map((style) => style.value)).toContain('none');

    for (const style of featured) {
      const card = screen.getByTestId(`video-style-${style.value}`);
      const img = card.querySelector('img');
      expect(img, `${style.value} card has no <img>`).not.toBeNull();
      expect(img!.getAttribute('src')).toBe(style.thumbnail);
      expect(img!.getAttribute('alt')).toContain(style.label);
      // No placeholder-only cards.
      expect(card.textContent).toContain(style.label);
    }
  });

  it('renders a real thumbnail for every style in the full catalogue dialog', async () => {
    renderBrief();

    await act(async () => {
      screen.getByText('View All').click();
    });

    for (const style of VIDEO_STYLES) {
      const card = screen.getByTestId(`video-style-all-${style.value}`);
      const img = card.querySelector('img');
      expect(img, `${style.value} dialog card has no <img>`).not.toBeNull();
      expect(img!.getAttribute('src')).toBe(style.thumbnail);
    }
  });

  it('matches the rendered thumbnail source snapshot', () => {
    renderBrief();
    const sources = getFeaturedVideoStyles().map((style) => {
      const img = screen.getByTestId(`video-style-${style.value}`).querySelector('img');
      return `${style.value} -> ${img?.getAttribute('src')}`;
    });
    expect(sources).toMatchInlineSnapshot(`
      [
        "none -> /style-thumbnails/none.svg",
        "cinematic -> /style-thumbnails/cinematic.svg",
        "scribble -> /style-thumbnails/scribble.svg",
        "film-noir -> /style-thumbnails/film-noir.svg",
      ]
    `);
  });
});

describe('aspect ratio selector', () => {
  it('uses design tokens, not raw hex or off-palette blue', () => {
    renderBrief();
    const active = screen.getByTestId('aspect-ratio-16:9');
    expect(active.className).toContain('bg-accent-ember');
    expect(active.className).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(active.className).not.toMatch(/blue/);
  });
});
