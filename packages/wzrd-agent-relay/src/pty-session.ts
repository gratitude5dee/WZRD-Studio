import { Daytona } from '@daytona/sdk';

import { auditEvent, markSessionStopped } from './audit';
import type { Env } from './index';
import { verifyToken, type RelayClaims } from './verify-token';

type ResizeMessage = { kind: 'resize'; cols: number; rows: number };

export class WzrdAgentPtySession {
  private attached = false;
  private env: Env;

  constructor(_state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected_websocket', { status: 400 });
    }
    const token = new URL(req.url).searchParams.get('token');
    if (!token) return new Response('missing_token', { status: 400 });

    let claims: RelayClaims;
    try {
      claims = await verifyToken({ token, secret: this.env.DAYTONA_RELAY_JWT_SECRET });
    } catch {
      return new Response('invalid_token', { status: 401 });
    }

    if (this.attached) {
      return new Response('session_already_attached', { status: 409 });
    }
    this.attached = true;

    let server: WebSocket | undefined;
    let closePty: (() => Promise<void>) | undefined;

    try {
      const pair = new WebSocketPair();
      const client = pair[0];
      server = pair[1];
      server.accept();

      const daytona = new Daytona({ apiKey: this.env.DAYTONA_API_KEY });
      const sandbox = await daytona.get(claims.sandbox_id);
      const pty = await sandbox.process.createPty({
        id: buildPtyId({ sessionId: claims.session_id }),
        cols: 100,
        rows: 32,
        cwd: claims.workspace_dir,
        onData: (chunk: Uint8Array | string) => {
          try {
            server?.send(typeof chunk === 'string' ? chunk : chunk.buffer);
          } catch {
            // socket closed
          }
        },
      });

      closePty = () => pty.kill();
      await pty.sendInput(buildStartupCommand({ claims }));
      await auditEvent(this.env, claims.session_id, 'pty_attached', { sandboxId: claims.sandbox_id });

      server.addEventListener('message', (event) => {
        void (async () => {
          if (typeof event.data === 'string') {
            const resize = parseResizeMessage(event.data);
            if (resize) {
              await pty.resize(resize.cols, resize.rows);
              return;
            }
            await pty.sendInput(event.data);
            return;
          }
          await pty.sendInput(new Uint8Array(event.data as ArrayBuffer));
        })();
      });

      server.addEventListener('close', () => {
        void (async () => {
          this.attached = false;
          await closePty?.().catch(() => {});
          await auditEvent(this.env, claims.session_id, 'pty_detached', { sandboxId: claims.sandbox_id });
        })();
      });

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      this.attached = false;
      await closePty?.().catch(() => {});
      server?.close(1011, 'init_failed');
      await auditEvent(this.env, claims.session_id, 'pty_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      await markSessionStopped(this.env, claims.session_id);
      return new Response('session_init_failed', { status: 502 });
    }
  }
}

export function buildPtyId({
  sessionId,
  nonce = crypto.randomUUID().slice(0, 8),
}: {
  sessionId: string;
  nonce?: string;
}): string {
  const safePrefix = sessionId.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12);
  return `wzrd-agent-${safePrefix}-${nonce}`;
}

export function buildStartupCommand({ claims }: { claims: RelayClaims }): string {
  return (
    [
      'set +o history 2>/dev/null || true',
      `cd ${shellQuote(claims.workspace_dir)} 2>/dev/null || cd /tmp`,
      `mkdir -p ${shellQuote(claims.input_dir)} ${shellQuote(claims.output_dir)} /tmp/wzrd-tools`,
      'export HISTFILE=/dev/null',
      `export WZRD_AGENT_INPUT_DIR=${shellQuote(claims.input_dir)}`,
      `export WZRD_AGENT_OUTPUT_DIR=${shellQuote(claims.output_dir)}`,
      `printf '%s\\n' ${shellQuote(`wzrd daytona agent | session ${claims.session_id.slice(0, 8)}`)}`,
      'if command -v qcut-entrypoint >/dev/null 2>&1 && [ -n "${OPENAI_API_KEY:-}" ]; then',
      '  QCUT_BOOTSTRAP_CODEX=1 qcut-entrypoint true >/dev/null 2>&1 || true',
      'fi',
      'CODEX_BIN="$(command -v codex || true)"',
      'CODEX_NATIVE_BIN="/usr/local/lib/node_modules/@openai/codex/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/codex/codex"',
      'CODEX_HOOK_TRUST_FLAG=""',
      'if [ -x "$CODEX_NATIVE_BIN" ] && "$CODEX_NATIVE_BIN" --help 2>&1 | grep -q -- "--dangerously-bypass-hook-trust"; then',
      '  CODEX_HOOK_TRUST_FLAG="--dangerously-bypass-hook-trust"',
      'elif [ -n "$CODEX_BIN" ] && "$CODEX_BIN" --help 2>&1 | grep -q -- "--dangerously-bypass-hook-trust"; then',
      '  CODEX_HOOK_TRUST_FLAG="--dangerously-bypass-hook-trust"',
      'fi',
      'if [ -x "$CODEX_NATIVE_BIN" ]; then',
      '  "$CODEX_NATIVE_BIN" --dangerously-bypass-approvals-and-sandbox $CODEX_HOOK_TRUST_FLAG --no-alt-screen',
      'elif [ -n "$CODEX_BIN" ]; then',
      '  "$CODEX_BIN" --dangerously-bypass-approvals-and-sandbox $CODEX_HOOK_TRUST_FLAG --no-alt-screen',
      'else',
      "  printf '%s\\n' 'Codex CLI not found; shell fallback is ready.'",
      '  exec /bin/bash -l',
      'fi',
    ].join('\n') + '\n'
  );
}

export function parseResizeMessage(data: string): ResizeMessage | null {
  if (!data.trimStart().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(data);
    if (parsed?.kind !== 'resize') return null;
    if (typeof parsed.cols !== 'number' || typeof parsed.rows !== 'number') return null;
    return { kind: 'resize', cols: parsed.cols, rows: parsed.rows };
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}
