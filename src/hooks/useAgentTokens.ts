import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

export const AGENT_SCOPES = ['read', 'generate', 'billing'] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export const SCOPE_DESCRIPTIONS: Record<AgentScope, string> = {
  read: 'Read projects, storyboards, timelines and prices. Never spends credits.',
  generate: 'Run generations (images, shots, workflows, exports). Spends credits.',
  billing: 'Create Stripe checkout links for top-ups. Cannot move money on its own.',
};

export const TOKEN_PREFIX = 'wzrd_pat_';

export interface AgentToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: AgentScope[];
  daily_credit_cap: number;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface MintTokenInput {
  name: string;
  scopes: AgentScope[];
  dailyCreditCap: number;
  expiresAt: string | null;
}

const SELECT_COLUMNS =
  'id,name,token_prefix,scopes,daily_credit_cap,expires_at,last_used_at,revoked_at,created_at';

// `wzrd_api_tokens` is not in the generated Database types (that file is
// generated and must not be hand-edited), so reach the table through an
// untyped client view.
function tokensTable() {
  return (supabase as unknown as SupabaseClient).from('wzrd_api_tokens');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Mint, list and revoke the personal access tokens agent harnesses authenticate
 * with. The raw token is generated in the browser and only its sha256 digest is
 * ever sent to the database, so it exists exactly once: in the caller's hands.
 */
export function useAgentTokens() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setTokens([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error: queryError } = await tokensTable()
      .select(SELECT_COLUMNS)
      .order('created_at', { ascending: false });
    setIsLoading(false);
    if (queryError) {
      setError(queryError.message);
      return;
    }
    setError(null);
    setTokens((data ?? []) as AgentToken[]);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Returns the raw token; it cannot be recovered after this call. */
  const mintToken = useCallback(
    async (input: MintTokenInput): Promise<{ token: string; row: AgentToken }> => {
      if (!user) throw new Error('Sign in before minting an agent token.');

      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const raw = `${TOKEN_PREFIX}${base64Url(random)}`;

      const { data, error: insertError } = await tokensTable()
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          token_hash: await sha256Hex(raw),
          token_prefix: raw.slice(0, TOKEN_PREFIX.length + 6),
          scopes: input.scopes,
          daily_credit_cap: input.dailyCreditCap,
          expires_at: input.expiresAt,
        })
        .select(SELECT_COLUMNS)
        .single();

      if (insertError) throw new Error(insertError.message);
      await refresh();
      return { token: raw, row: data as AgentToken };
    },
    [refresh, user],
  );

  const revokeToken = useCallback(
    async (tokenId: string) => {
      const { error: updateError } = await tokensTable()
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', tokenId);
      if (updateError) throw new Error(updateError.message);
      await refresh();
    },
    [refresh],
  );

  const updateToken = useCallback(
    async (tokenId: string, patch: { dailyCreditCap?: number; scopes?: AgentScope[] }) => {
      const { error: updateError } = await tokensTable()
        .update({
          ...(patch.dailyCreditCap === undefined ? {} : { daily_credit_cap: patch.dailyCreditCap }),
          ...(patch.scopes === undefined ? {} : { scopes: patch.scopes }),
        })
        .eq('id', tokenId);
      if (updateError) throw new Error(updateError.message);
      await refresh();
    },
    [refresh],
  );

  return { tokens, isLoading, error, refresh, mintToken, revokeToken, updateToken };
}
