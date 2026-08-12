import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { CastTab } from '../CastTab';
import { TabErrorBoundary } from '../TabErrorBoundary';
import type { Character } from '../types';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const characters: Character[] = [
  { id: 'char-1', name: 'Ada', description: 'A keeper' },
];

const renderCast = (onGenerateAllImages: () => Promise<void>) =>
  render(
    <TabErrorBoundary>
      <CastTab
        characters={characters}
        scenes={[]}
        onAddCharacter={vi.fn()}
        onDeleteCharacter={vi.fn()}
        onGenerateAllImages={onGenerateAllImages}
      />
    </TabErrorBoundary>,
  );

describe('cast generation errors', () => {
  it('surfaces failures inline with a retry affordance instead of failing silently', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const generate = vi.fn().mockRejectedValue(new Error('Ada: model unavailable'));

    renderCast(generate);

    await act(async () => {
      screen.getByText('Generate All').click();
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Character image generation failed');
    expect(alert).toHaveTextContent('Ada: model unavailable');

    // Reported to the error boundary rather than swallowed.
    expect(consoleError).toHaveBeenCalledWith(
      '[project-setup] CastTab.generateAllImages failed',
      expect.any(Error),
    );

    // Retry re-runs generation.
    generate.mockResolvedValueOnce(undefined);
    await act(async () => {
      screen.getByText('Retry').click();
    });

    expect(generate).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    consoleError.mockRestore();
  });

  it('shows no error when generation succeeds', async () => {
    const generate = vi.fn().mockResolvedValue(undefined);
    renderCast(generate);

    await act(async () => {
      screen.getByText('Generate All').click();
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
