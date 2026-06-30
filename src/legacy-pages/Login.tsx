import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, Mail, Sparkles, Wallet } from 'lucide-react';
import { ConnectEmbed } from 'thirdweb/react';
import type { ThirdwebClient } from 'thirdweb';
import { useAuth } from '@/providers/AuthProvider';
import { AnimatedLogo } from '@/components/ui/animated-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/integrations/supabase/client';
import { getThirdwebClient } from '@/lib/thirdweb/client';
import { createThirdwebWallets } from '@/lib/thirdweb/wallets';
import { wzrdTheme } from '@/lib/thirdweb/theme';
import { appRoutes, resolvePostLoginPath, sanitizeNextPath } from '@/lib/routes';
import { cn } from '@/lib/utils';
import {
  clearDesktopThirdwebAuthNext,
  consumeDesktopThirdwebAuthNext,
  getDesktopThirdwebAuthReturnUrl,
  rememberDesktopThirdwebAuthNext,
} from '@/lib/desktop';
import {
  getThirdwebAuthCallbackIssue,
  stripThirdwebAuthCallbackParams,
} from '@/lib/thirdweb/auth-callback';

const ambientParticles = [
  { left: '13%', top: '22%', delay: 0.2, duration: 5.8, tone: 'primary' },
  { left: '24%', top: '74%', delay: 1.1, duration: 7.2, tone: 'secondary' },
  { left: '39%', top: '16%', delay: 2.4, duration: 6.4, tone: 'primary' },
  { left: '58%', top: '82%', delay: 0.7, duration: 7.8, tone: 'secondary' },
  { left: '72%', top: '28%', delay: 1.8, duration: 6.8, tone: 'primary' },
  { left: '86%', top: '63%', delay: 2.9, duration: 5.9, tone: 'secondary' },
];

function buildSupabaseRedirectUrl(next: string | null): string {
  const origin = typeof window === 'undefined' ? 'http://localhost:3000' : window.location.origin;
  const url = new URL(appRoutes.login, origin);
  const safeNext = sanitizeNextPath(next);

  if (safeNext) {
    url.searchParams.set('next', safeNext);
  }

  return url.toString();
}

function getCallbackError(hash: string, search: string): string | null {
  for (const rawParams of [hash, search]) {
    if (!rawParams) continue;

    const params = new URLSearchParams(rawParams.startsWith('#') || rawParams.startsWith('?') ? rawParams.slice(1) : rawParams);
    const message = params.get('error_description') ?? params.get('error') ?? params.get('error_code');

    if (message) {
      return message;
    }
  }

  return null;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authenticateWallet, isWalletAuthenticating, walletAuthError } = useAuth();
  const [thirdwebClient, setThirdwebClient] = useState<ThirdwebClient | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const nextFromQuery = useMemo(() => new URLSearchParams(location.search).get('next'), [location.search]);
  const callbackIssue = useMemo(() => getThirdwebAuthCallbackIssue(location.search), [location.search]);
  const supabaseCallbackError = useMemo(() => getCallbackError(location.hash, location.search), [location.hash, location.search]);
  const safeNext = useMemo(() => sanitizeNextPath(nextFromQuery), [nextFromQuery]);
  const loginWallets = useMemo(
    () =>
      createThirdwebWallets({
        desktopAuthReturnUrl: getDesktopThirdwebAuthReturnUrl(),
      }),
    [],
  );

  useEffect(() => {
    if (nextFromQuery) {
      rememberDesktopThirdwebAuthNext(nextFromQuery);
    }
  }, [nextFromQuery]);

  useEffect(() => {
    getThirdwebClient()
      .then(setThirdwebClient)
      .catch((err) => {
        console.error('Failed to load Thirdweb client:', err);
        setConfigError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    if (!callbackIssue) {
      return;
    }

    clearDesktopThirdwebAuthNext();
    setCallbackError(callbackIssue.message);
    setWalletOpen(true);

    const nextSearch = stripThirdwebAuthCallbackParams(location.search);
    navigate(`${location.pathname}${nextSearch}${location.hash}`, { replace: true });
  }, [callbackIssue, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (walletAuthError || isWalletAuthenticating || configError) {
      setWalletOpen(true);
    }
  }, [configError, isWalletAuthenticating, walletAuthError]);

  // Only redirect once a real Supabase session exists.
  // Connecting a wallet alone is not enough: wallet-auth must complete first.
  useEffect(() => {
    if (user) {
      navigate(resolvePostLoginPath(nextFromQuery, consumeDesktopThirdwebAuthNext() ?? appRoutes.home), { replace: true });
    }
  }, [user, navigate, nextFromQuery]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setEmailSentTo(null);
    setGoogleLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildSupabaseRedirectUrl(safeNext),
        },
      });

      if (error) {
        setAuthError(error.message);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();
    setAuthError(null);
    setEmailSentTo(null);

    if (!trimmedEmail) {
      setAuthError('Enter an email address to continue.');
      return;
    }

    setEmailLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: buildSupabaseRedirectUrl(safeNext),
        },
      });

      if (error) {
        setAuthError(error.message);
        return;
      }

      setEmailSentTo(trimmedEmail);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Email sign-in failed');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleWalletRetry = async () => {
    setWalletOpen(true);
    await authenticateWallet();
  };

  const authCallbackError = callbackError ?? callbackIssue?.message ?? null;
  const pageAuthError = authError ?? supabaseCallbackError;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030405] px-4 py-10 text-white">
      <div className="absolute inset-0">
        <div
          className="absolute left-1/2 top-[-24%] h-[620px] w-[960px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[130px]"
          style={{
            background:
              'radial-gradient(circle, rgba(255,107,74,0.95) 0%, rgba(45,212,191,0.24) 42%, transparent 76%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.32) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {ambientParticles.map((particle) => (
          <motion.div
            key={`${particle.left}-${particle.top}`}
            className="absolute h-[2px] w-[2px] rounded-full"
            style={{
              left: particle.left,
              top: particle.top,
              backgroundColor:
                particle.tone === 'primary' ? 'hsl(var(--glow-primary))' : 'rgb(45 212 191)',
            }}
            animate={{ y: [0, -18, 0], opacity: [0.2, 0.55, 0.2] }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_110px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl lg:grid-cols-[0.92fr_1.08fr]"
      >
        <section className="hidden min-h-[620px] border-r border-white/[0.07] bg-black/25 p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <AnimatedLogo size="lg" showVersion={true} autoplay={true} delay={0.3} />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-medium text-orange-200">
              <Sparkles className="h-3.5 w-3.5" />
              Cinematic AI production suite
            </div>
            <h1 className="mt-5 max-w-sm text-4xl font-semibold leading-tight tracking-normal text-white">
              Sign in and keep the creative timeline moving.
            </h1>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/30 p-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs text-white/45">
              <span>Studio status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Ready
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ['200+', 'models'],
                ['4K', 'exports'],
                ['Live', 'sync'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-3">
                  <div className="text-lg font-semibold text-white">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/35">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <AnimatedLogo size="lg" showVersion={true} autoplay={true} delay={0.3} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-orange-300/80">WZRD Studio</p>
              <h2 className="text-3xl font-semibold tracking-normal text-white">Sign in</h2>
              <p className="text-sm leading-6 text-white/50">
                Welcome back to the cinematic AI production suite.
              </p>
            </div>

            {pageAuthError ? (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{pageAuthError}</span>
              </div>
            ) : null}

            {emailSentTo ? (
              <div className="mt-6 flex gap-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Magic link sent to {emailSentTo}.</span>
              </div>
            ) : null}

            <div className="mt-7 space-y-3">
              <Button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="h-12 w-full rounded-lg border border-white/[0.09] bg-white text-sm font-semibold text-black hover:bg-white/90"
              >
                {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-base font-bold">G</span>}
                Continue with Google
              </Button>

              <form onSubmit={handleEmailSignIn} className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@studio.com"
                    aria-label="Email address"
                    className="h-12 rounded-lg border-white/[0.1] bg-black/30 text-white placeholder:text-white/30"
                  />
                  <Button
                    type="submit"
                    disabled={emailLoading}
                    className="h-12 rounded-lg bg-orange-500 px-5 text-sm font-semibold text-white hover:bg-orange-400 sm:w-[150px]"
                  >
                    {emailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Email link
                  </Button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => setWalletOpen((open) => !open)}
                className={cn(
                  'flex h-12 w-full items-center justify-between rounded-lg border px-4 text-left text-sm transition-colors',
                  walletOpen
                    ? 'border-orange-400/30 bg-orange-500/10 text-orange-100'
                    : 'border-white/[0.09] bg-white/[0.04] text-white/75 hover:bg-white/[0.07]',
                )}
              >
                <span className="inline-flex items-center gap-2 font-medium">
                  <Wallet className="h-4 w-4" />
                  Wallet sign-in
                </span>
                <span className="text-xs text-white/45">{walletOpen ? 'Open' : 'Connect'}</span>
              </button>

              {walletOpen ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/30 p-3">
                  {authCallbackError ? (
                    <div className="px-2 py-4 text-center">
                      <p className="text-sm text-red-200">{authCallbackError}</p>
                      <p className="mt-2 text-xs text-white/45">Start wallet sign-in again from this screen.</p>
                    </div>
                  ) : configError ? (
                    <div className="px-2 py-4 text-center">
                      <p className="text-sm text-red-200">Wallet sign-in is unavailable.</p>
                      <p className="mt-2 text-xs text-white/45">{configError}</p>
                    </div>
                  ) : !thirdwebClient ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner size="lg" />
                    </div>
                  ) : (
                    <>
                      <ConnectEmbed
                        client={thirdwebClient}
                        wallets={loginWallets}
                        theme={wzrdTheme}
                        modalSize="compact"
                        showThirdwebBranding={false}
                        className="!w-full !bg-transparent !border-0"
                      />
                      {isWalletAuthenticating ? (
                        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/45">
                          <LoadingSpinner size="sm" />
                          <span>Verifying wallet signature...</span>
                        </div>
                      ) : null}
                      {walletAuthError ? (
                        <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-3 text-center">
                          <p className="text-xs text-red-200">{walletAuthError}</p>
                          <div className="mt-3 flex justify-center">
                            <Button
                              type="button"
                              onClick={handleWalletRetry}
                              disabled={isWalletAuthenticating}
                              className="h-9 rounded-md bg-white/10 px-3 text-xs text-white hover:bg-white/15"
                            >
                              Retry wallet
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-white/35">
              By continuing, you agree to the WZRD Studio Terms of Service.
            </p>
          </div>
        </section>
      </motion.main>
    </div>
  );
};

export default Login;
