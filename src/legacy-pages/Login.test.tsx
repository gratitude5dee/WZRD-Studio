import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from './Login';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  authenticateWallet: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  getThirdwebClient: vi.fn(),
}));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
      signInWithOtp: mocks.signInWithOtp,
    },
  },
}));

vi.mock('@/lib/thirdweb/client', () => ({
  getThirdwebClient: mocks.getThirdwebClient,
}));

vi.mock('@/lib/thirdweb/wallets', () => ({
  createThirdwebWallets: vi.fn(() => []),
}));

vi.mock('@/lib/thirdweb/theme', () => ({
  wzrdTheme: {},
}));

vi.mock('thirdweb/react', () => ({
  ConnectEmbed: () => <div data-testid="connect-embed">Wallet connect options</div>,
}));

vi.mock('@/components/ui/animated-logo', () => ({
  AnimatedLogo: () => <div data-testid="animated-logo">WZRD</div>,
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div role="status">Loading</div>,
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockAuth(overrides: Partial<ReturnType<typeof baseAuth>> = {}) {
  mocks.authenticateWallet.mockResolvedValue(false);
  mocks.useAuth.mockReturnValue({
    ...baseAuth(),
    ...overrides,
  });
}

function baseAuth() {
  return {
    user: null,
    authenticateWallet: mocks.authenticateWallet,
    isWalletAuthenticating: false,
    walletAuthError: null,
  };
}

describe('Login', () => {
  beforeEach(() => {
    mocks.getThirdwebClient.mockResolvedValue({});
    mocks.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
    mockAuth();
  });

  it('keeps Google, email, and wallet options visible when wallet auth fails', async () => {
    mockAuth({
      walletAuthError: 'Edge Function returned a non-2xx status code',
    });

    renderLogin();

    expect(await screen.findByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email link/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /wallet sign-in/i })).toBeInTheDocument();
    expect(await screen.findByText('Edge Function returned a non-2xx status code')).toBeInTheDocument();
    expect(await screen.findByTestId('connect-embed')).toBeInTheDocument();
  });

  it('starts Google OAuth with a safe login redirect', async () => {
    renderLogin('/login?next=%2Fprojects%2Fproject-1%2Fstudio');

    await userEvent.click(await screen.findByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(mocks.signInWithOAuth).toHaveBeenCalledTimes(1));
    const [payload] = mocks.signInWithOAuth.mock.calls[0];
    const redirectUrl = new URL(payload.options.redirectTo);

    expect(payload.provider).toBe('google');
    expect(redirectUrl.pathname).toBe('/login');
    expect(redirectUrl.searchParams.get('next')).toBe('/projects/project-1/studio');
  });

  it('sends an email magic link through Supabase', async () => {
    renderLogin('/login?next=%2Fhome');

    await userEvent.type(screen.getByLabelText(/email address/i), 'maker@wzrd.test');
    await userEvent.click(screen.getByRole('button', { name: /email link/i }));

    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1));
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'maker@wzrd.test',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: expect.stringContaining('/login?next=%2Fhome'),
      },
    });
    expect(await screen.findByText('Magic link sent to maker@wzrd.test.')).toBeInTheDocument();
  });

  it('allows wallet auth retry without hiding other sign-in methods', async () => {
    mockAuth({
      walletAuthError: 'Wallet sign-in could not be completed.',
    });

    renderLogin();

    await userEvent.click(await screen.findByRole('button', { name: /retry wallet/i }));

    expect(mocks.authenticateWallet).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email link/i })).toBeInTheDocument();
  });
});
