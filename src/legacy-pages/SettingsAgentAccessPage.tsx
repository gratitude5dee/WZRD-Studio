import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, KeyRound, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { appRoutes } from '@/lib/routes';
import { SUPABASE_URL } from '@/integrations/supabase/config';
import {
  AGENT_SCOPES,
  SCOPE_DESCRIPTIONS,
  useAgentTokens,
  type AgentScope,
  type AgentToken,
} from '@/hooks/useAgentTokens';

const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp-server`;

const HARNESSES = [
  {
    id: 'claude',
    label: 'Claude Code',
    file: '.mcp.json (project root) — or run `claude mcp add`',
    snippet: (url: string) =>
      JSON.stringify(
        {
          mcpServers: {
            'wzrd-studio': {
              command: 'node',
              args: ['./plugin/bridge/index.mjs'],
              env: { WZRD_MCP_URL: url, WZRD_API_TOKEN: '${WZRD_API_TOKEN}' },
            },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    file: '.openclaw/mcp.json',
    snippet: (url: string) =>
      JSON.stringify(
        {
          servers: {
            'wzrd-remote': { transport: 'streamable-http', url },
          },
        },
        null,
        2,
      ),
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    file: '~/.codex/config.toml',
    snippet: (url: string) =>
      [
        '[mcp_servers.wzrd-studio]',
        'command = "node"',
        'args = ["./plugin/bridge/index.mjs"]',
        '',
        '[mcp_servers.wzrd-studio.env]',
        `WZRD_MCP_URL = "${url}"`,
        'WZRD_API_TOKEN = "wzrd_pat_…"',
      ].join('\n'),
  },
  {
    id: 'shell',
    label: 'Shell / CI',
    file: 'environment',
    snippet: (url: string) =>
      [
        '# Never commit the token. Export it in your shell profile or CI secret store.',
        'export WZRD_API_TOKEN="wzrd_pat_…"',
        `export WZRD_MCP_URL="${url}"`,
        'node ./plugin/bridge/index.mjs',
      ].join('\n'),
  },
] as const;

function formatWhen(value: string | null): string {
  if (!value) return 'never';
  return new Date(value).toLocaleString();
}

function tokenState(token: AgentToken): { label: string; tone: string } {
  if (token.revoked_at) return { label: 'revoked', tone: 'text-rose-400' };
  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    return { label: 'expired', tone: 'text-amber-400' };
  }
  return { label: 'active', tone: 'text-emerald-400' };
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 pr-12 text-xs leading-relaxed text-zinc-200">
        {value}
      </pre>
      <Button
        size="sm"
        variant="ghost"
        className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-100"
        aria-label="Copy snippet"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

const SettingsAgentAccessPage = () => {
  const { tokens, isLoading, error, mintToken, revokeToken, updateToken } = useAgentTokens();

  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>(['read']);
  const [dailyCap, setDailyCap] = useState('500');
  const [expiresAt, setExpiresAt] = useState('');
  const [isMinting, setIsMinting] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const activeTokens = useMemo(() => tokens.filter((token) => !token.revoked_at), [tokens]);
  const revokedTokens = useMemo(() => tokens.filter((token) => token.revoked_at), [tokens]);

  const toggleScope = (scope: AgentScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    );
  };

  const handleMint = async () => {
    if (!name.trim()) {
      toast.error('Give the token a name so you can tell your harnesses apart.');
      return;
    }
    if (scopes.length === 0) {
      toast.error('Select at least one scope.');
      return;
    }
    const cap = Number(dailyCap);
    if (!Number.isFinite(cap) || cap < 0) {
      toast.error('Daily credit cap must be zero or more.');
      return;
    }

    setIsMinting(true);
    try {
      const { token } = await mintToken({
        name,
        scopes,
        dailyCreditCap: Math.floor(cap),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setFreshToken(token);
      setName('');
      toast.success('Token minted — copy it now, it will not be shown again.');
    } catch (mintError) {
      toast.error(mintError instanceof Error ? mintError.message : 'Could not mint token');
    } finally {
      setIsMinting(false);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    setRevokingId(tokenId);
    try {
      await revokeToken(tokenId);
      toast.success('Token revoked. Agents using it lose access immediately.');
    } catch (revokeError) {
      toast.error(revokeError instanceof Error ? revokeError.message : 'Could not revoke token');
    } finally {
      setRevokingId(null);
    }
  };

  const handleCapChange = async (tokenId: string, dailyCreditCap: number) => {
    try {
      await updateToken(tokenId, { dailyCreditCap });
      toast.success(`Daily cap set to ${dailyCreditCap} credits.`);
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : 'Could not update the cap');
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(249,115,22,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_40%),#09090b] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
        <div className="mb-10">
          <Link
            to={appRoutes.settings.root}
            className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Agent access</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Personal access tokens let Claude Code, Codex, OpenClaw and Hermes drive WZRD Studio
            through MCP. Each token carries its own scopes and daily credit cap.
          </p>
        </div>

        {freshToken && (
          <Card className="mb-6 border-emerald-500/40 bg-emerald-500/5 p-6">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-300">
              Copy this token now
            </p>
            <p className="mt-1.5 text-sm text-zinc-300">
              It is shown once — only its hash is stored. Put it in <code>WZRD_API_TOKEN</code>.
            </p>
            <div className="mt-4">
              <CopyBlock value={freshToken} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-zinc-400 hover:text-zinc-100"
              onClick={() => setFreshToken(null)}
            >
              I have saved it
            </Button>
          </Card>
        )}

        {/* ---- Mint ---- */}
        <Card className="mb-6 border-zinc-800/80 bg-zinc-950/70 p-6">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-300" />
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Mint a token
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <Label htmlFor="token-name" className="text-xs text-zinc-400">
                Name
              </Label>
              <Input
                id="token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Claude Code — laptop"
                className="mt-1.5 border-zinc-700 bg-zinc-900/70 text-zinc-100"
              />
            </div>

            <div>
              <Label htmlFor="token-cap" className="text-xs text-zinc-400">
                Daily credit cap
              </Label>
              <Input
                id="token-cap"
                type="number"
                min={0}
                value={dailyCap}
                onChange={(event) => setDailyCap(event.target.value)}
                className="mt-1.5 border-zinc-700 bg-zinc-900/70 text-zinc-100"
              />
            </div>

            <div>
              <Label htmlFor="token-expiry" className="text-xs text-zinc-400">
                Expires (optional)
              </Label>
              <Input
                id="token-expiry"
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-1.5 border-zinc-700 bg-zinc-900/70 text-zinc-100"
              />
            </div>

            <div className="md:col-span-3">
              <p className="text-xs text-zinc-400">Scopes</p>
              <div className="mt-2 space-y-2">
                {AGENT_SCOPES.map((scope) => (
                  <label key={scope} className="flex items-start gap-3 text-sm text-zinc-300">
                    <Checkbox
                      checked={scopes.includes(scope)}
                      onCheckedChange={() => toggleScope(scope)}
                      aria-label={`Scope ${scope}`}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">{scope}</span>
                      <span className="ml-2 text-zinc-500">{SCOPE_DESCRIPTIONS[scope]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <Button className="mt-6" onClick={() => void handleMint()} disabled={isMinting}>
            {isMinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Mint token
          </Button>
        </Card>

        {/* ---- Existing tokens ---- */}
        <Card className="mb-6 border-zinc-800/80 bg-zinc-950/70 p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">Tokens</p>
          {error && (
            <p className="mt-4 flex items-center gap-2 text-sm text-rose-400">
              <ShieldAlert className="h-4 w-4" /> {error}
            </p>
          )}
          {isLoading ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
            </p>
          ) : tokens.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
              No agent tokens yet. Mint one above, then paste it into your harness config.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {[...activeTokens, ...revokedTokens].map((token) => {
                const state = tokenState(token);
                return (
                  <div
                    key={token.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">
                        {token.name}
                        <span className={`ml-2 text-[11px] uppercase ${state.tone}`}>{state.label}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {token.token_prefix}… · {token.scopes.join(', ')} · cap{' '}
                        {token.daily_credit_cap}/day · last used {formatWhen(token.last_used_at)}
                        {token.expires_at ? ` · expires ${formatWhen(token.expires_at)}` : ''}
                      </p>
                    </div>
                    {!token.revoked_at && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          defaultValue={token.daily_credit_cap}
                          aria-label={`Daily credit cap for ${token.name}`}
                          className="w-24 border-zinc-700 bg-zinc-900/70 text-zinc-100"
                          onBlur={(event) => {
                            const next = Number(event.target.value);
                            if (!Number.isFinite(next) || next < 0 || next === token.daily_credit_cap) return;
                            void handleCapChange(token.id, Math.floor(next));
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:bg-zinc-800"
                          onClick={() => void handleRevoke(token.id)}
                          disabled={revokingId === token.id}
                        >
                          {revokingId === token.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ---- Install ---- */}
        <Card className="border-zinc-800/80 bg-zinc-950/70 p-6">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
            Connect a harness
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            The MCP endpoint is <code className="text-zinc-200">{MCP_URL}</code>. The token belongs in
            the <code className="text-zinc-200">WZRD_API_TOKEN</code> environment variable (or a JSON
            file pointed at by <code className="text-zinc-200">WZRD_CREDENTIALS_PATH</code>) — never in
            a committed config file.
          </p>
          <Tabs defaultValue={HARNESSES[0].id} className="mt-5">
            <TabsList className="bg-zinc-900/70">
              {HARNESSES.map((harness) => (
                <TabsTrigger key={harness.id} value={harness.id}>
                  {harness.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {HARNESSES.map((harness) => (
              <TabsContent key={harness.id} value={harness.id} className="mt-4">
                <p className="mb-2 text-xs text-zinc-500">{harness.file}</p>
                <CopyBlock value={harness.snippet(MCP_URL)} />
              </TabsContent>
            ))}
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default SettingsAgentAccessPage;
