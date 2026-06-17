import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  openExternal: vi.fn(),
  user: { id: 'desktop-user' },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: mocks.invoke,
    },
  },
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

describe('useBilling desktop behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation(async (functionName: string) => {
      if (functionName === 'billing-catalog') {
        return {
          data: {
            success: true,
            billing_mode: 'test_only',
            checkout_available: true,
            plans: [],
            credit_packs: [],
            subscription: null,
            wallet: null,
            plan: null,
          },
          error: null,
        };
      }

      if (functionName === 'billing-checkout') {
        return {
          data: {
            success: true,
            checkout_url: 'https://checkout.stripe.com/c/session_123',
          },
          error: null,
        };
      }

      if (functionName === 'billing-portal') {
        return {
          data: {
            success: true,
            portal_url: 'https://billing.stripe.com/session_123',
          },
          error: null,
        };
      }

      return { data: null, error: null };
    });

    Object.defineProperty(window, 'wzrdDesktop', {
      configurable: true,
      value: {
        isDesktop: true,
        platform: 'darwin',
        getDeepLink: (path: string) => `wzrd://${path.replace(/^\/+/, '')}`,
        openExternal: mocks.openExternal,
      },
    });
  });

  it('sends desktop return URLs and opens checkout externally', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    const { result } = renderHook(() => useBilling());

    await act(async () => {
      await result.current.startCheckout({
        checkout_mode: 'pack',
        pack_code: 'pack_500',
      });
    });

    expect(mocks.invoke).toHaveBeenCalledWith('billing-checkout', {
      body: {
        checkout_mode: 'pack',
        pack_code: 'pack_500',
        success_url: 'wzrd://billing/success',
        cancel_url: 'wzrd://billing/cancel',
      },
    });
    expect(mocks.openExternal).toHaveBeenCalledWith('https://checkout.stripe.com/c/session_123');
  });

  it('uses a desktop return URL and opens the billing portal externally', async () => {
    const { useBilling } = await import('@/hooks/useBilling');
    const { result } = renderHook(() => useBilling());

    await act(async () => {
      await result.current.openPortal();
    });

    expect(mocks.invoke).toHaveBeenCalledWith('billing-portal', {
      body: { return_url: 'wzrd://billing/success' },
    });
    expect(mocks.openExternal).toHaveBeenCalledWith('https://billing.stripe.com/session_123');
  });
});
