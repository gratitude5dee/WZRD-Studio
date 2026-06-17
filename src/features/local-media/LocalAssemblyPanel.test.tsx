import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalAssemblyPanel } from './LocalAssemblyPanel';
import type { ShotDetails } from '@/types/storyboardTypes';

const mocks = vi.hoisted(() => ({
  shots: [] as ShotDetails[],
  desktop: {
    selectExportFolder: vi.fn(async () => '/Users/me/Desktop'),
    cacheRemoteMedia: vi.fn(async () => ({
      name: 'cached-shot.mp4',
      path: '/Users/me/cache/shot.mp4',
      mimeType: 'video/mp4',
    })),
    renderTimeline: vi.fn(async ({ outputPath }: { outputPath: string }) => ({ outputPath })),
    onMediaProgress: vi.fn(() => vi.fn()),
  },
  getDesktopBridge: vi.fn(),
  invoke: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/lib/desktop', () => ({
  getDesktopBridge: mocks.getDesktopBridge,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(async () => ({
          data: table === 'shots' ? mocks.shots : [],
          error: null,
        })),
        single: vi.fn(async () => ({
          data: table === 'projects' ? { title: 'Project', aspect_ratio: '16:9' } : null,
          error: null,
        })),
      };
      return query;
    }),
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock('sonner', () => ({
  toast: mocks.toast,
}));

const shot = (overrides: Partial<ShotDetails> = {}): ShotDetails => ({
  id: 'shot-1',
  scene_id: 'scene-1',
  project_id: 'project-1',
  shot_number: 1,
  shot_type: null,
  prompt_idea: null,
  visual_prompt: null,
  dialogue: null,
  sound_effects: null,
  image_url: null,
  image_status: 'pending',
  video_url: null,
  video_status: 'pending',
  audio_url: null,
  audio_status: 'pending',
  luma_generation_id: null,
  ...overrides,
});

describe('LocalAssemblyPanel', () => {
  beforeEach(() => {
    mocks.shots = [
      shot({
        video_status: 'completed',
        video_url: 'https://cdn.example.com/shot.mp4',
      }),
    ];
    mocks.desktop.selectExportFolder.mockClear();
    mocks.desktop.cacheRemoteMedia.mockClear();
    mocks.desktop.renderTimeline.mockClear();
    mocks.desktop.onMediaProgress.mockClear();
    mocks.getDesktopBridge.mockReset();
    mocks.getDesktopBridge.mockReturnValue(mocks.desktop);
    mocks.invoke.mockReset();
    mocks.toast.error.mockReset();
    mocks.toast.success.mockReset();
  });

  it("renders Director's Cut assembly with local FFmpeg instead of a hosted render API", async () => {
    render(
      <LocalAssemblyPanel
        projectId="project-1"
        projectTitle="Demo Project"
        aspectRatio="16:9"
        scenes={[{ id: 'scene-1', scene_number: 1 }]}
      />,
    );

    expect(await screen.findByText('1/1 ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /render local ffmpeg mp4/i }));

    await waitFor(() => expect(mocks.desktop.renderTimeline).toHaveBeenCalledTimes(1));
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.desktop.cacheRemoteMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://cdn.example.com/shot.mp4',
      }),
    );

    const renderPayload = mocks.desktop.renderTimeline.mock.calls[0][0];
    expect(renderPayload).toEqual(
      expect.objectContaining({
        projectId: 'project-1',
        outputPath: expect.stringMatching(/^\/Users\/me\/Desktop\/Demo-Project-storyboard-\d+\.mp4$/),
        timeline: expect.objectContaining({
          projectId: 'project-1',
          visualTracks: [
            expect.objectContaining({
              id: 'shot-1',
              sourcePath: '/Users/me/cache/shot.mp4',
            }),
          ],
          exportSettings: expect.objectContaining({
            format: 'mp4',
            outputPath: expect.stringMatching(/^\/Users\/me\/Desktop\/Demo-Project-storyboard-\d+\.mp4$/),
          }),
        }),
      }),
    );
  });
});
