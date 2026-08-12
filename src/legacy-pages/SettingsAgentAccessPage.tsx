import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Copy, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { appRoutes } from '@/lib/routes';

const MCP_URL = 'https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server';
const REPO = 'gratitude5dee/WZRD-Studio';

interface Snippet {
  label: string;
  command: string;
}

const CLAUDE_SNIPPETS: Snippet[] = [
  { label: 'Add the marketplace', command: `/plugin marketplace add ${REPO}` },
  { label: 'Install the plugin', command: '/plugin install wzrd-studio' },
  { label: 'Or add the MCP server directly', command: `claude mcp add --transport http wzrd-remote ${MCP_URL} --header "Authorization: Bearer $WZRD_PAT"` },
  { label: 'Export your token first', command: 'export WZRD_PAT=wzrd_pat_…' },
];

const CODEX_SNIPPETS: Snippet[] = [
  { label: 'Add the MCP server', command: `codex mcp add wzrd-remote --url ${MCP_URL} --bearer-token-env-var WZRD_PAT` },
  { label: 'Install the skills', command: `npx skills add github:${REPO}/plugin/skills` },
];

const HERMES_SNIPPETS: Snippet[] = [
  { label: 'Hermes: point the harness at the repo config', command: 'hermes agent use ./com.hermes/agent.yaml' },
  { label: 'OpenClaw: activate the plugin', command: `openclaw plugin add github:${REPO}` },
  { label: 'Both read the same skills', command: `npx skills add github:${REPO}/plugin/skills` },
];

const IDE_SNIPPETS: Snippet[] = [
  {
    label: 'VS Code / Copilot (.vscode/mcp.json)',
    command: `{
  "servers": {
    "wzrd-remote": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${env:WZRD_PAT}" }
    }
  }
}`,
  },
  {
    label: 'Cursor (~/.cursor/mcp.json) and Kiro (.kiro/settings/mcp.json)',
    command: `{
  "mcpServers": {
    "wzrd-remote": {
      "type": "http",
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer \${env:WZRD_PAT}" }
    }
  }
}`,
  },
];

const CopyBlock = ({ snippet }: { snippet: Snippet }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(snippet.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{snippet.label}</div>
      <div className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <pre className="flex-1 overflow-x-auto text-xs text-zinc-200">{snippet.command}</pre>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`Copy: ${snippet.label}`}
          onClick={copy}
          className="text-zinc-400 hover:text-zinc-100"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

const SettingsAgentAccessPage = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
        <Link to={appRoutes.settings.root} className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
          Back to Settings
        </Link>

        <h1 className="mb-2 text-3xl font-semibold">Agent access</h1>
        <p className="mb-8 max-w-2xl text-sm text-zinc-400">
          Connect Claude Code, Codex, Hermes, OpenClaw, or your IDE to WZRD Studio over MCP. Agents authenticate with a
          personal access token, iterate on your storyboard for free, and must show you an exact credit number before
          anything is charged.
        </p>

        <Card className="mb-6 border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-lg font-semibold">1. Create a personal access token</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
            <li>
              Scopes: <code>read</code> (browse), <code>write</code> (edit the storyboard), <code>generate</code>{' '}
              (spend credits), <code>billing</code> (balance and checkout). Grant the least you need.
            </li>
            <li>Set a monthly credit cap on the token; the server refuses a spend that would exceed it.</li>
            <li>
              The token is shown once. Export it as <code>WZRD_PAT</code> — never paste it into a config file that gets
              committed.
            </li>
          </ul>
          <div className="mt-4">
            <CopyBlock snippet={{ label: 'Shell', command: 'export WZRD_PAT=wzrd_pat_…' }} />
          </div>
        </Card>

        <Card className="mb-6 border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-lg font-semibold">2. Install in your client</h2>
          <Tabs defaultValue="claude">
            <TabsList className="bg-zinc-950">
              <TabsTrigger value="claude">Claude Code</TabsTrigger>
              <TabsTrigger value="codex">Codex</TabsTrigger>
              <TabsTrigger value="hermes">Hermes/OpenClaw</TabsTrigger>
              <TabsTrigger value="ide">VS Code/Cursor/Copilot/Kiro</TabsTrigger>
            </TabsList>

            <TabsContent value="claude" className="space-y-3 pt-4">
              <p className="text-sm text-zinc-400">
                The marketplace install brings the nine skills, the <code>/wzrd:*</code> commands, and a hook that
                renders storyboards as tables.
              </p>
              {CLAUDE_SNIPPETS.map((snippet) => (
                <CopyBlock key={snippet.label} snippet={snippet} />
              ))}
            </TabsContent>

            <TabsContent value="codex" className="space-y-3 pt-4">
              <p className="text-sm text-zinc-400">
                Codex reads the same skills from <code>plugin/skills/</code>; the MCP server carries the tools.
              </p>
              {CODEX_SNIPPETS.map((snippet) => (
                <CopyBlock key={snippet.label} snippet={snippet} />
              ))}
            </TabsContent>

            <TabsContent value="hermes" className="space-y-3 pt-4">
              <p className="text-sm text-zinc-400">
                Hermes maps every generation tool through draft/approve. OpenClaw activation is manifest-only — the
                tools and skills are identical.
              </p>
              {HERMES_SNIPPETS.map((snippet) => (
                <CopyBlock key={snippet.label} snippet={snippet} />
              ))}
            </TabsContent>

            <TabsContent value="ide" className="space-y-3 pt-4">
              <p className="text-sm text-zinc-400">
                Any client that speaks streamable HTTP MCP works with skills + <code>mcp.json</code> alone; the
                client-specific extensions are optional.
              </p>
              {IDE_SNIPPETS.map((snippet) => (
                <CopyBlock key={snippet.label} snippet={snippet} />
              ))}
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="mb-6 border-zinc-800 bg-zinc-900/60 p-5">
          <h2 className="text-lg font-semibold">3. How spending works</h2>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
            <li>The agent checks your balance with <code>get_credits</code>.</li>
            <li>Storyboard iteration (<code>storyboard_propose</code>, <code>_diff</code>, <code>_commit</code>) is free.</li>
            <li>Any generation is previewed with <code>dryRun: true</code>, which costs nothing.</li>
            <li>You approve a specific credit number; the agent then spends with an idempotency key so a retry cannot double-charge.</li>
            <li>Results come back as a link to your timeline.</li>
          </ol>
          <p className="mt-3 text-sm text-zinc-400">
            Video handoff (<code>seedance_handoff</code>) currently runs in review mode only: it compiles the reference
            packet for free. Auto-submit stays disabled until verified catalog pricing exists — WZRD never guesses a price.
          </p>
        </Card>

        <div className="flex flex-wrap gap-3">
          <a href={`${MCP_URL}/health`} target="_blank" rel="noreferrer">
            <Button variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800">
              Server health
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <a href={`https://github.com/${REPO}/tree/main/plugin/skills`} target="_blank" rel="noreferrer">
            <Button variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800">
              Browse the skills
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <Link to={appRoutes.settings.billing}>
            <Button variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800">
              Credits &amp; billing
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SettingsAgentAccessPage;
