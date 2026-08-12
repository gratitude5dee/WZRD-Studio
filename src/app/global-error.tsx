'use client';

import { useEffect } from 'react';

type GlobalErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Root-layout failures bypass `error.tsx`; keep this fallback entirely
 * self-contained so it remains available even if the app shell cannot mount.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('WZRD global recovery boundary:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: '#05070a', color: '#f1ebdd', margin: 0 }}>
        <main style={{ alignItems: 'center', display: 'grid', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', minHeight: '100svh', padding: '1.5rem', placeItems: 'center' }}>
          <section style={{ maxWidth: '30rem', textAlign: 'center' }}>
            <p style={{ color: '#8cc8ff', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>WZRD · recovery</p>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.3rem, 9vw, 4.5rem)', fontWeight: 400, letterSpacing: '-0.06em', lineHeight: 0.94, margin: '1rem 0' }}>Reload the signal.</h1>
            <p style={{ color: 'rgba(241, 235, 221, 0.7)', lineHeight: 1.6, margin: '0 auto 1.75rem' }}>A browser session needs to refresh before WZRD can continue.</p>
            <button onClick={reset} style={{ background: '#f1ebdd', border: 0, borderRadius: '999px', color: '#05070a', cursor: 'pointer', minHeight: '44px', padding: '0.75rem 1rem' }} type="button">Reload WZRD</button>
          </section>
        </main>
      </body>
    </html>
  );
}
