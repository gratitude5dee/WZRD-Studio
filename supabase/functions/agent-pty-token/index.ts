import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, handleCors, safeErrorResponse, successResponse } from '../_shared/response.ts';
import { createRelayConnectionPayload } from '../_shared/daytona-agent/relay-token.ts';
import { parsePtyTokenRequest } from '../_shared/daytona-agent/validation.ts';
import { loadSessionForUser, recordAgentEvent, touchSession } from '../_shared/daytona-agent/sessions.ts';
import { serializeSession } from '../_shared/daytona-agent/serializers.ts';

function getAdminClient() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    if (req.method !== 'POST') {
      return errorResponse('method_not_allowed', 405);
    }
    const user = await authenticateRequest(req.headers);
    const supabase = getAdminClient();
    const body = await parsePtyTokenRequest(req);
    const session = await loadSessionForUser({
      supabase,
      userId: user.id,
      sessionId: body.sessionId,
    });
    if (!['ready', 'active'].includes(session.status)) {
      return errorResponse('daytona_session_not_ready', 409);
    }
    const connection = await createRelayConnectionPayload(session);
    await touchSession({ supabase, sessionId: session.id, status: 'active' });
    await recordAgentEvent({
      supabase,
      userId: user.id,
      sessionId: session.id,
      eventType: 'relay_token_issued',
      metadata: { expiresAt: connection.expiresAt },
    });
    return successResponse({
      session: serializeSession({ ...session, status: 'active', last_active_at: new Date().toISOString() }),
      wsUrl: connection.wsUrl,
      expiresAt: connection.expiresAt,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof Error && error.message === 'daytona_session_not_found') {
      return errorResponse('daytona_session_not_found', 404);
    }
    if (error instanceof Error && error.message === 'session_sandbox_not_ready') {
      return errorResponse('session_sandbox_not_ready', 409);
    }
    return safeErrorResponse(error, 'agent-pty-token');
  }
});
