import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

/** Only the storyline function is scripted; everything else stays inert. */
let storylineResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
    functions: {
      invoke: (name: string) =>
        Promise.resolve(name === 'generate-storylines' ? storylineResult : { data: null, error: null }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

import { ProjectProvider, useProjectContext } from '../ProjectContext';
import TabNavigation from '../TabNavigation';
import NavigationFooter from '../NavigationFooter';

const Driver = () => {
  const { generateStoryline, setActiveTab, storylineStatus } = useProjectContext();

  return (
    <div>
      <span data-testid="storyline-status">{storylineStatus}</span>
      <button
        data-testid="generate"
        onClick={async () => {
          await generateStoryline('project-1');
          setActiveTab('settings');
        }}
      >
        generate
      </button>
    </div>
  );
};

const renderWizard = () =>
  render(
    <ProjectProvider>
      <TabNavigation />
      <NavigationFooter />
      <Driver />
    </ProjectProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storyline generation that never starts', () => {
  it('reports failure so the wizard is not stuck without an escape hatch', async () => {
    storylineResult = { data: null, error: { message: 'edge function unavailable' } };
    renderWizard();

    screen.getByTestId('generate').click();

    await waitFor(() =>
      expect(screen.getByTestId('storyline-status').textContent).toBe('failed'),
    );
    expect(screen.getByTestId('wizard-tab-breakdown')).toBeDisabled();
    // The failure is reported, so the footer offers the explicit override.
    expect(screen.getByText('Continue anyway')).toBeInTheDocument();
  });

  it('marks the storyline as generating once the request is accepted', async () => {
    storylineResult = { data: { ok: true }, error: null };
    renderWizard();

    screen.getByTestId('generate').click();

    await waitFor(() =>
      expect(screen.getByTestId('storyline-status').textContent).toBe('generating'),
    );
    expect(screen.queryByText('Continue anyway')).toBeNull();
  });
});
