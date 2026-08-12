/**
 * Phase 6 — PAT auth primitives: token hashing, scope enforcement (-32002) and
 * the monthly cap payload (-32003 with { used, cap, resetsAt }).
 */
import { describe, expect, it } from 'vitest';
import {
  MCP_ERROR_CAP_EXCEEDED,
  MCP_ERROR_FORBIDDEN,
  MCP_ERROR_UNAUTHENTICATED,
  assertScope,
  assertWithinCap,
  currentPeriodMonth,
  extractBearerToken,
  hashToken,
  nextMonthlyResetIso,
  normalizeScopes,
} from '../../supabase/functions/mcp-server/auth.ts';
import { redactDeep, redactSecrets } from '../../supabase/functions/mcp-server/redact.ts';

const context = (scopes: string[], overrides: Record<string, unknown> = {}) => ({
  userId: 'user-1',
  tokenId: 'token-1',
  scopes: normalizeScopes(scopes),
  monthlyCreditCap: null,
  creditsUsedThisPeriod: 0,
  resetsAt: nextMonthlyResetIso(),
  ...overrides,
});

describe('token handling', () => {
  it('hashes tokens and never stores them in plain text', async () => {
    const hash = await hashToken('wzrd_pat_abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('wzrd_pat_abc');
    expect(await hashToken('wzrd_pat_abc')).toBe(hash);
    expect(await hashToken('wzrd_pat_abd')).not.toBe(hash);
  });

  it('extracts a bearer token case-insensitively and ignores anything else', () => {
    expect(extractBearerToken(new Headers({ Authorization: 'Bearer wzrd_pat_x' }))).toBe('wzrd_pat_x');
    expect(extractBearerToken(new Headers({ authorization: 'bearer wzrd_pat_x' }))).toBe('wzrd_pat_x');
    expect(extractBearerToken(new Headers({ Authorization: 'Basic abc' }))).toBeNull();
    expect(extractBearerToken(new Headers())).toBeNull();
  });

  it('normalizes scopes, drops unknown ones, and always keeps read', () => {
    expect(normalizeScopes(['read', 'generate', 'root'])).toEqual(['read', 'generate']);
    expect(normalizeScopes(['generate'])).toEqual(['read', 'generate']);
    expect(normalizeScopes(null)).toEqual(['read']);
  });
});

describe('scope enforcement', () => {
  it('allows a call the token is scoped for', () => {
    expect(() => assertScope(context(['read', 'generate']), 'generate', 'generate_shot_image')).not.toThrow();
  });

  it('rejects a read-only token calling a generate tool with -32002 naming the scope', () => {
    try {
      assertScope(context(['read']), 'generate', 'generate_shot_image');
      throw new Error('expected assertScope to throw');
    } catch (error) {
      const failure = error as { code?: number; message: string };
      expect(failure.code).toBe(MCP_ERROR_FORBIDDEN);
      expect(failure.code).toBe(-32002);
      expect(failure.message).toContain('"generate" scope');
      expect(failure.message).toContain('generate_shot_image');
    }
  });

  it('uses distinct codes for unauthenticated and forbidden', () => {
    expect(MCP_ERROR_UNAUTHENTICATED).toBe(-32001);
    expect(MCP_ERROR_FORBIDDEN).toBe(-32002);
    expect(MCP_ERROR_CAP_EXCEEDED).toBe(-32003);
  });
});

describe('monthly cap', () => {
  it('allows a spend inside the cap', () => {
    expect(() => assertWithinCap(context([], { monthlyCreditCap: 10, creditsUsedThisPeriod: 4 }), 6)).not.toThrow();
  });

  it('rejects a spend over the cap with { used, cap, resetsAt }', () => {
    try {
      assertWithinCap(context([], { monthlyCreditCap: 10, creditsUsedThisPeriod: 9 }), 2);
      throw new Error('expected assertWithinCap to throw');
    } catch (error) {
      const failure = error as { code?: number; data?: Record<string, unknown> };
      expect(failure.code).toBe(-32003);
      expect(failure.data).toMatchObject({ used: 9, cap: 10 });
      expect(typeof failure.data?.resetsAt).toBe('string');
      expect(Number.isNaN(Date.parse(String(failure.data?.resetsAt)))).toBe(false);
    }
  });

  it('treats a null cap as uncapped', () => {
    expect(() => assertWithinCap(context([], { monthlyCreditCap: null, creditsUsedThisPeriod: 9999 }), 1000)).not.toThrow();
  });

  it('resets at the first instant of next month', () => {
    const reset = nextMonthlyResetIso(new Date('2026-08-12T09:00:00Z'));
    expect(reset.startsWith('2026-09-01')).toBe(true);
    expect(currentPeriodMonth(new Date('2026-08-12T09:00:00Z'))).toBe('2026-08-01');
  });
});

describe('secret redaction', () => {
  it('scrubs JWTs, supabase keys and provider keys', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop';
    expect(redactSecrets(`token=${jwt}`)).not.toContain(jwt);
    expect(redactSecrets('sb_secret_abcdefgh12345678')).not.toContain('abcdefgh12345678');
    expect(redactSecrets('key=sk-abcdefghijklmnopqrstuvwx')).not.toContain('sk-abcdefghijklmnopqrstuvwx');
  });

  it('scrubs nested payloads without dropping harmless fields', () => {
    const scrubbed = redactDeep({
      ok: true,
      shots: [{ id: 'shot-1', image_url: 'https://cdn/1.png' }],
      leaked: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.qwertyuiopasdfgh',
    }) as Record<string, unknown>;
    expect(scrubbed.ok).toBe(true);
    expect(JSON.stringify(scrubbed)).toContain('https://cdn/1.png');
    expect(JSON.stringify(scrubbed)).not.toContain('qwertyuiopasdfgh');
  });
});
