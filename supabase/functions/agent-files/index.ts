import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, handleCors, safeErrorResponse, successResponse } from '../_shared/response.ts';
import { downloadOutputFile, listOutputFiles, uploadInputFile } from '../_shared/daytona-agent/files.ts';
import { loadSessionForUser } from '../_shared/daytona-agent/sessions.ts';
import { serializeFileEntry } from '../_shared/daytona-agent/serializers.ts';
import { normalizeRequiredUuid, parseFileListRequest } from '../_shared/daytona-agent/validation.ts';

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
      const download = url.searchParams.get('download');
      const sessionId = normalizeRequiredUuid(url.searchParams.get('sessionId'), 'sessionId');
      const session = await loadSessionForUser({ supabase, userId: user.id, sessionId });

      if (download) {
        const file = await downloadOutputFile({ supabase, session, filename: download });
        return new Response(file.bytes as BodyInit, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${file.filename.replaceAll('"', '')}"`,
          },
        });
      }

      const { path } = parseFileListRequest(url);
      const files = await listOutputFiles({ supabase, session, path });
      return successResponse({ path, files: files.map(serializeFileEntry) });
    }

    if (req.method === 'POST') {
      const form = await req.formData();
      const sessionId = normalizeRequiredUuid(form.get('sessionId'), 'sessionId');
      const file = form.get('file');
      if (!(file instanceof File)) {
        return errorResponse('upload_file_required', 400);
      }
      const session = await loadSessionForUser({ supabase, userId: user.id, sessionId });
      const uploaded = await uploadInputFile({ supabase, session, file });
      return successResponse({ file: serializeFileEntry(uploaded) }, 201);
    }

    return errorResponse('method_not_allowed', 405);
  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof Error && error.message === 'daytona_session_not_found') {
      return errorResponse('daytona_session_not_found', 404);
    }
    if (error instanceof Error && /invalid|traversal|too_large|empty|required/.test(error.message)) {
      return errorResponse(error.message, 400);
    }
    return safeErrorResponse(error, 'agent-files');
  }
});
