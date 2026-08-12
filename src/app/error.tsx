'use client';

import { useEffect } from 'react';

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * A route-level recovery boundary. It intentionally does not depend on the
 * landing runtime, fonts, or generated media so a transient client failure
 * always leaves visitors a way back into the product.
 */
export default function RouteError({ error, reset }: RouteErrorProps) {
  useEffect(() => {
    console.error('WZRD route recovery boundary:', error);
  }, [error]);

  return (
    <main
      aria-labelledby="route-error-title"
      style={{
        alignItems: 'center',
        background: '#05070a',
        color: '#f1ebdd',
        display: 'grid',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        minHeight: '100svh',
        padding: '1.5rem',
        placeItems: 'center',
      }}
    >
      <section style={{ maxWidth: '30rem', textAlign: 'center' }}>
        <p style={{ color: '#8cc8ff', fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase' }}>WZRD · recovery</p>
        <h1 id="route-error-title" style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.3rem, 9vw, 4.5rem)', fontWeight: 400, letterSpacing: '-0.06em', lineHeight: 0.94, margin: '1rem 0' }}>The signal needs a fresh start.</h1>
        <p style={{ color: 'rgba(241, 235, 221, 0.7)', lineHeight: 1.6, margin: '0 auto 1.75rem' }}>Your work is safe. Try the page again, or return to the Creator OS.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={reset} style={{ background: '#f1ebdd', border: 0, borderRadius: '999px', color: '#05070a', cursor: 'pointer', minHeight: '44px', padding: '0.75rem 1rem' }} type="button">Try again</button>
          <a href="/" style={{ alignItems: 'center', border: '1px solid rgba(241, 235, 221, 0.35)', borderRadius: '999px', color: '#f1ebdd', display: 'inline-flex', minHeight: '44px', padding: '0.75rem 1rem', textDecoration: 'none' }}>Creator OS</a>
        </div>
      </section>
    </main>
  );
}
