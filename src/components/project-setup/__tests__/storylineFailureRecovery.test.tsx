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
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
}));

import { ProjectProvider, useProjectContext } from '../ProjectContext';
import TabNavigation from '../TabNavigation';
import TabContent from '../TabContent';
import NavigationFooter from '../NavigationFooter';

interface HarnessProps {
  activeTab?: ProjectSetupTab;
  storylineStatus?: StorylineProgressStatus;
  /** Bypasses gated navigation, mimicking a stale/direct tab activation. */
  forceBreakdown?: boolean;
}

const Driver = ({ activeTab, storylineStatus, forceBreakdown }: HarnessProps) => {
  const { setStorylineStatus, setActiveTab, wizardState } = useProjectContext();

  useEffect(() => {
    if (storylineStatus) setStorylineStatus(storylineStatus);
  }, [storylineStatus, setStorylineStatus]);

  useEffect(() => {
    if (forceBreakdown) setActiveTab('breakdown');
    else if (activeTab) setActiveTab(activeTab);
  }, [activeTab, forceBreakdown]);

  return <span data-testid="active-tab">{wizardState.activeTab}</span>;
};

const renderWizard = (props: HarnessProps = {}) =>
  render(
    <ProjectProvider>
      <TabNavigation />
      <TabContent />
      <NavigationFooter />
      <Driver {...props} />
    </ProjectProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('storyline failure recovery', () => {
  it('keeps Breakdown locked after a failure but offers an explicit escape hatch', () => {
    renderWizard({ storylineStatus: 'failed', activeTab: 'settings' });

    const breakdown = screen.getByTestId('wizard-tab-breakdown');
    expect(breakdown).toBeDisabled();
    expect(breakdown.closest('span')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Storyline generation failed'),
    );

    act(() => {
      screen.getByText('Continue anyway').click();
    });

    expect(screen.getByTestId('wizard-tab-breakdown')).not.toBeDisabled();
    expect(screen.queryByText('Continue anyway')).toBeNull();
  });

  it('offers no escape hatch while generation is still pending', () => {
    renderWizard({ storylineStatus: 'generating', activeTab: 'settings' });
    expect(screen.getByTestId('wizard-tab-breakdown')).toBeDisabled();
    expect(screen.queryByText('Continue anyway')).toBeNull();
  });

  it('re-locks Breakdown when the storyline is retried after an override', () => {
    const { rerender } = renderWizard({ storylineStatus: 'failed', activeTab: 'settings' });

    act(() => {
      screen.getByText('Continue anyway').click();
    });
    expect(screen.getByTestId('wizard-tab-breakdown')).not.toBeDisabled();

    act(() => {
      rerender(
        <ProjectProvider>
          <TabNavigation />
          <TabContent />
          <NavigationFooter />
          <Driver storylineStatus="generating" activeTab="settings" />
        </ProjectProvider>,
      );
    });
    expect(screen.getByTestId('wizard-tab-breakdown')).toBeDisabled();
  });
});

describe('locked breakdown content', () => {
  it('explains the prerequisite instead of rendering a blank page on direct activation', async () => {
    renderWizard({ forceBreakdown: true });

    expect(screen.getByTestId('active-tab').textContent).toBe('breakdown');
    const locked = await screen.findByTestId('breakdown-locked');
    expect(locked).toHaveTextContent('Breakdown is not ready yet');
    expect(locked).toHaveTextContent('Storyline');
  });
});
