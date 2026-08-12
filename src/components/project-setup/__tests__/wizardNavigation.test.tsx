import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEffect } from 'react';
import type { ProjectSetupTab } from '../types';
import type { StorylineProgressStatus } from '../ProjectContext';

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ upsert: () => Promise.resolve({ error: null }) }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

import { ProjectProvider, useProjectContext } from '../ProjectContext';
import ProjectSetupHeader from '../ProjectSetupHeader';
import TabNavigation from '../TabNavigation';

interface HarnessProps {
  activeTab?: ProjectSetupTab;
  storylineStatus?: StorylineProgressStatus;
  conceptOption?: 'ai' | 'manual';
}

/** Drives context state from outside so tests never poke component internals. */
const Driver = ({ activeTab, storylineStatus, conceptOption }: HarnessProps) => {
  const { setStorylineStatus, setActiveTab, updateProjectData, wizardState, goToTab } =
    useProjectContext();

  useEffect(() => {
    if (conceptOption) updateProjectData({ conceptOption });
  }, [conceptOption]);

  useEffect(() => {
    if (storylineStatus) setStorylineStatus(storylineStatus);
  }, [storylineStatus, setStorylineStatus]);

  useEffect(() => {
    if (activeTab) setActiveTab(activeTab);
  }, [activeTab]);

  return (
    <div>
      <span data-testid="visible-tabs">{wizardState.visibleTabs.join(',')}</span>
      <button data-testid="try-breakdown" onClick={() => goToTab('breakdown')}>
        try breakdown
      </button>
    </div>
  );
};

const renderWizard = (props: HarnessProps = {}) =>
  render(
    <ProjectProvider>
      <ProjectSetupHeader />
      <TabNavigation />
      <Driver {...props} />
    </ProjectProvider>,
  );

const currentStep = () => screen.getByTestId('wizard-current-step').textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('wizard step indicator', () => {
  it('starts at step 1 of 4 in AI mode', () => {
    renderWizard();
    expect(screen.getByTestId('visible-tabs').textContent).toBe(
      'concept,storyline,settings,breakdown',
    );
    expect(currentStep()).toBe('1');
    expect(screen.getByText('of 4')).toBeInTheDocument();
  });

  it('advances across all four steps', () => {
    const { rerender } = renderWizard();
    const steps: ProjectSetupTab[] = ['concept', 'storyline', 'settings', 'breakdown'];

    steps.forEach((tab, index) => {
      act(() => {
        rerender(
          <ProjectProvider>
            <ProjectSetupHeader />
            <TabNavigation />
            <Driver activeTab={tab} storylineStatus="complete" />
          </ProjectProvider>,
        );
      });
      expect(currentStep()).toBe(String(index + 1));
    });
  });

  it('numbers steps from the visible tabs in manual mode (3 steps)', () => {
    renderWizard({ conceptOption: 'manual', activeTab: 'settings' });
    expect(screen.getByTestId('visible-tabs').textContent).toBe(
      'concept,settings,breakdown',
    );
    expect(currentStep()).toBe('2');
    expect(screen.getByText('of 3')).toBeInTheDocument();
  });
});

describe('breakdown gating', () => {
  it('disables Breakdown until Storyline reports complete', () => {
    renderWizard();
    const breakdown = screen.getByTestId('wizard-tab-breakdown');
    expect(breakdown).toBeDisabled();
    expect(breakdown.closest('span')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Storyline'),
    );
  });

  it('rejects direct navigation to Breakdown before completion', () => {
    renderWizard();
    act(() => {
      screen.getByTestId('try-breakdown').click();
    });
    // Still on step 1: the gated navigation refused the jump.
    expect(currentStep()).toBe('1');
  });

  it('unlocks Breakdown once Storyline reports complete', () => {
    renderWizard({ storylineStatus: 'complete' });
    expect(screen.getByTestId('wizard-tab-breakdown')).not.toBeDisabled();

    act(() => {
      screen.getByTestId('try-breakdown').click();
    });
    expect(currentStep()).toBe('4');
  });

  it('keeps Breakdown reachable in manual mode, which has no Storyline step', () => {
    renderWizard({ conceptOption: 'manual' });
    expect(screen.getByTestId('wizard-tab-breakdown')).not.toBeDisabled();
  });
});
