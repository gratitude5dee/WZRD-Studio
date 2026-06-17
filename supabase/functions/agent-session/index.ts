import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, handleCors, safeErrorResponse, successResponse } from '../_shared/response.ts';
import { createSandbox, ensureSandboxDirs, stopSandbox } from '../_shared/daytona-agent/daytona.ts';
import { parseCreateSessionRequest, normalizeRequiredUuid } from '../_shared/daytona-agent/validation.ts';
import {
  assertProjectAccess,
  createSessionRecord,
  findReusableSession,
  loadSessionForUser,
  markSessionFailed,
  markSessionReady,
  recordAgentEvent,
  stopSessionRecord,
} from '../_shared/daytona-agent/sessions.ts';
import { serializeSession } from '../_shared/daytona-agent/serializers.ts';

function getAdminClient() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    const user = await authenticateRequest(req.headers);
    const supabase = getAdminClient();
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const sessionId = url.searchParams.get('sessionId');
      if (sessionId) {
        const session = await loadSessionForUser({
          supabase,
          userId: user.id,
          sessionId: normalizeRequiredUuid(sessionId, 'sessionId'),
        });
        return successResponse({ session: serializeSession(session) });
      }

      const { data, error } = await supabase
        .from('daytona_agent_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) {
        return errorResponse('daytona_sessions_list_failed', 500);
      }
      return successResponse({ sessions: (data ?? []).map(serializeSession) });
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}));
      const session = await loadSessionForUser({
        supabase,
        userId: user.id,
        sessionId: normalizeRequiredUuid(body.sessionId, 'sessionId'),
      });
      if (session.sandbox_id && session.status !== 'stopped') {
        await stopSandbox(session).catch((error) => {
          console.warn('[agent-session] sandbox stop failed:', error);
        });
      }
      const stopped = await stopSessionRecord({ supabase, session });
      return successResponse({ session: serializeSession(stopped) });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }

    const body = await parseCreateSessionRequest(req);
    await assertProjectAccess({ supabase, userId: user.id, projectId: body.projectId ?? null });

    if (!body.forceNew) {
      const reusable = await findReusableSession({
        supabase,
        userId: user.id,
        projectId: body.projectId ?? null,
      });
      if (reusable) {
        return successResponse({ session: serializeSession(reusable) });
      }
    }

    let session = await createSessionRecord({
      supabase,
      userId: user.id,
      projectId: body.projectId ?? null,
    });

    try {
      await recordAgentEvent({
        supabase,
        userId: user.id,
        sessionId: session.id,
        eventType: 'sandbox_create_started',
        metadata: { projectId: body.projectId ?? null },
      });
      const { sandboxId } = await createSandbox();
      session = await markSessionReady({ supabase, sessionId: session.id, sandboxId });
      await ensureSandboxDirs(session);
      return successResponse({ session: serializeSession(session) }, 201);
    } catch (error) {
      await markSessionFailed({ supabase, session, error });
      return errorResponse('daytona_sandbox_create_failed', 502, {
        message: error instanceof Error ? error.message : String(error),
        sessionId: session.id,
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof Error && error.message === 'project_access_denied') {
      return errorResponse('project_access_denied', 403);
    }
    if (error instanceof Error && error.message === 'daytona_session_not_found') {
      return errorResponse('daytona_session_not_found', 404);
    }
    return safeErrorResponse(error, 'agent-session');
  }
});
