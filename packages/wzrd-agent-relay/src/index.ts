export { WzrdAgentPtySession } from './pty-session';

import { peekSessionId } from './verify-token';

export interface Env {
  WZRD_AGENT_PTY: DurableObjectNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  DAYTONA_API_KEY: string;
  DAYTONA_RELAY_JWT_SECRET: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname !== '/pty') {
      return new Response('not_found', { status: 404 });
    }
    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('missing_token', { status: 400 });
    }
    const sessionId = peekSessionId(token);
    if (!sessionId) {
      return new Response('bad_token', { status: 400 });
    }
    const id = env.WZRD_AGENT_PTY.idFromName(sessionId);
    return env.WZRD_AGENT_PTY.get(id).fetch(req);
  },
};
