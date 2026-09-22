// deno-lint-ignore-file no-explicit-any
// ---------------------------------------------------------------------------
// motion-splat — backend for the Motion Splat studio.
//
// Actions (POST JSON `{ action, ... }`):
//   submit   { stage: 'video'|'depth'|'triposplat', input, clientRequestId? }
//            → reserves credits, records a generation_jobs row, submits the
//              fal queue request and returns { jobId }.
//   status   { jobId } → polls fal once; when the job completes it copies the
//            outputs into Storage, commits the credit hold and returns them.
//   manifest { manifest } → persists a MotionSplatManifest JSON in Storage and
//            records it as a completed generation_jobs row.
//   list     → the caller's saved manifests.
//
// Long fal jobs therefore span many short requests instead of one request
// that polls for minutes, and the UI can resume after a reload.
// ---------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthError, resolveRequestIdentity } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { executeFalModel, getCanonicalFalModel, mergeFalModelInputs, pollFalStatus } from '../_shared/falai-client.ts';
import {
  buildCreditIdempotencyKey,
  commitCredits,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
} from '../_shared/credits.ts';
import { safeLog } from '../_shared/safe-logger.ts';
import {
  buildDepthInputs,
  buildGenericImageToVideoInputs,
  buildKlingImageToVideoInputs,
  buildManifestPath,
  buildStoragePath,
  buildTriposplatInputs,
  contentTypeFor,
  extensionFor,
  isMotionSplatStage,
  MOTION_SPLAT_BUCKET,
  MOTION_SPLAT_COSTS,
  MOTION_SPLAT_JOB_KIND,
  MOTION_SPLAT_MAX_DOWNLOAD_BYTES,
  MOTION_SPLAT_MODELS,
  buildClaimToken,
  clampListLimit,
  isClaimExpired,
  normalizeFalStatus,
  parseExtraInputs,
  pickOutputFile,
  videoModelCost,
  progressForState,
  toJobSummary,
  type FalFileRef,
  type MotionSplatJobRow,
  type MotionSplatStage,
} from '../_shared/motion-splat.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

const MAX_PROMPT_LENGTH = 2_000;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

interface StageSubmission {
  modelId: string;
  inputs: Record<string, unknown>;
  cost: number;
  outputKind: 'video' | 'splat';
  resourceType: string;
  jobType: 'video' | 'process';
  summary: Record<string, unknown>;
}

function prepareStage(stage: MotionSplatStage, rawInput: Record<string, unknown>): StageSubmission {
  if (stage === 'video') {
    const imageUrl = rawInput.imageUrl;
    if (!isHttpUrl(imageUrl)) throw new ValidationError('input.imageUrl must be an http(s) URL');
    const prompt = typeof rawInput.prompt === 'string' ? rawInput.prompt.slice(0, MAX_PROMPT_LENGTH) : '';
    const duration = typeof rawInput.duration === 'number' && Number.isFinite(rawInput.duration) ? rawInput.duration : 5;
    const modelId = typeof rawInput.modelId === 'string' && rawInput.modelId.trim() ? rawInput.modelId.trim() : MOTION_SPLAT_MODELS.defaultVideo;
    // Only models the studio offers, priced from the explicit table: the shared
    // resolver would substitute a fallback model (and its price) for anything else.
    const cost = videoModelCost(modelId);
    if (cost === null) throw new ValidationError(`Unsupported image-to-video model: ${modelId}`);
    const canonical = getCanonicalFalModel(modelId);
    if (!canonical || canonical.media_type !== 'video' || canonical.workflow_type !== 'image-to-video') {
      throw new ValidationError(`Unsupported image-to-video model: ${modelId}`);
    }
    const inputs =
      modelId === MOTION_SPLAT_MODELS.defaultVideo
        ? buildKlingImageToVideoInputs({ imageUrl, prompt, duration, generateAudio: false })
        : mergeFalModelInputs(modelId, buildGenericImageToVideoInputs({ imageUrl, prompt, duration })).inputs;
    return {
      modelId,
      inputs,
      cost,
      outputKind: 'video',
      resourceType: 'video',
      jobType: 'video',
      summary: { image_url: imageUrl, prompt, duration, model: modelId },
    };
  }
  if (stage === 'depth') {
    const videoUrl = rawInput.videoUrl;
    if (!isHttpUrl(videoUrl)) throw new ValidationError('input.videoUrl must be an http(s) URL');
    const extra = parseExtraInputs(Deno.env.get('MOTION_SPLAT_DEPTH_EXTRA_INPUT'));
    return {
      modelId: MOTION_SPLAT_MODELS.depth,
      inputs: buildDepthInputs(videoUrl, extra),
      cost: MOTION_SPLAT_COSTS.depth,
      outputKind: 'video',
      resourceType: 'generation',
      jobType: 'process',
      summary: { video_url: videoUrl, model: MOTION_SPLAT_MODELS.depth },
    };
  }
  const imageUrl = rawInput.imageUrl;
  if (!isHttpUrl(imageUrl)) throw new ValidationError('input.imageUrl must be an http(s) URL');
  const seed = typeof rawInput.seed === 'number' ? rawInput.seed : undefined;
  return {
    modelId: MOTION_SPLAT_MODELS.splat,
    inputs: buildTriposplatInputs(imageUrl, seed),
    cost: MOTION_SPLAT_COSTS.triposplat,
    outputKind: 'splat',
    resourceType: 'generation',
    jobType: 'process',
    summary: { image_url: imageUrl, keyframe_time: rawInput.time ?? null, model: MOTION_SPLAT_MODELS.splat },
  };
}

class ValidationError extends Error {}

async function copyToStorage(ref: FalFileRef, path: string, kind: 'video' | 'splat' | 'image') {
  const response = await fetch(ref.url);
  if (!response.ok) throw new Error(`Failed to download output (${response.status})`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MOTION_SPLAT_MAX_DOWNLOAD_BYTES) throw new Error('Output exceeds the size limit');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MOTION_SPLAT_MAX_DOWNLOAD_BYTES) throw new Error('Output exceeds the size limit');
  const contentType = contentTypeFor(kind, ref, response.headers.get('content-type'));
  const { error } = await admin.storage.from(MOTION_SPLAT_BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = admin.storage.from(MOTION_SPLAT_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, contentType, size: bytes.byteLength };
}

async function fetchFalResult(responseUrl: string | undefined, fallback: unknown, falKey: string): Promise<unknown> {
  if (!responseUrl) return fallback;
  const response = await fetch(responseUrl, { headers: { Authorization: `Key ${falKey}` } });
  if (!response.ok) throw new Error(`Failed to fetch final fal result (${response.status})`);
  return await response.json();
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let identity;
  try {
    identity = await resolveRequestIdentity(req.headers);
  } catch (error) {
    return errorResponse(error instanceof AuthError ? error.message : 'Unauthorized', 401);
  }
  const { userId, client: userClient, tokenId } = identity;

  let body: Record<string, unknown>;
  try {
    body = asRecord(await req.json());
  } catch {
    return errorResponse('Invalid request body', 400);
  }
  const action = typeof body.action === 'string' ? body.action : '';
  const falKey = Deno.env.get('FAL_KEY') ?? '';

  try {
    switch (action) {
      // ---------------------------------------------------------------- submit
      case 'submit': {
        if (!falKey) return errorResponse('Server configuration error: FAL_KEY not set', 500);
        const stage = body.stage;
        if (!isMotionSplatStage(stage)) return errorResponse('stage must be video, depth or triposplat', 400);
        let submission: StageSubmission;
        try {
          submission = prepareStage(stage, asRecord(body.input));
        } catch (error) {
          if (error instanceof ValidationError) return errorResponse(error.message, 400);
          throw error;
        }
        const clientRequestId = typeof body.clientRequestId === 'string' && body.clientRequestId.length <= 80 ? body.clientRequestId : crypto.randomUUID();

        // A retried submit must return the job it already created rather than
        // start a second fal run: the credit hold is bound to one job id, so a
        // replayed request id can never back more work than it paid for.
        const { data: existing } = await userClient
          .from('generation_jobs')
          .select('id, status, progress, external_request_id')
          .eq('user_id', userId)
          .eq('config->>kind', MOTION_SPLAT_JOB_KIND)
          .eq('config->>stage', stage)
          .eq('config->>client_request_id', clientRequestId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) {
          return successResponse({
            jobId: existing.id,
            stage,
            status: existing.status === 'failed' || existing.status === 'cancelled' ? 'failed' : existing.status === 'completed' ? 'completed' : 'processing',
            progress: existing.progress ?? 10,
            requestId: existing.external_request_id ?? null,
            credits: submission.cost,
            deduplicated: true,
          });
        }

        const jobId = crypto.randomUUID();

        const reservation = await reserveCredits({
          supabase: userClient,
          userId,
          tokenId,
          resourceType: submission.resourceType,
          requestedAmount: submission.cost,
          referenceType: 'motion_splat',
          referenceId: jobId,
          idempotencyKey: buildCreditIdempotencyKey('motion-splat', userId, jobId),
          metadata: { endpoint: 'motion-splat', stage, model: submission.modelId, client_request_id: clientRequestId },
        });

        const { error: insertError } = await admin.from('generation_jobs').insert({
          id: jobId,
          user_id: userId,
          job_type: submission.jobType,
          status: 'processing',
          progress: 5,
          model_id: submission.modelId,
          input_assets: [],
          config: {
            kind: MOTION_SPLAT_JOB_KIND,
            stage,
            client_request_id: clientRequestId,
            input: submission.summary,
            output_kind: submission.outputKind,
            credits: { hold_id: reservation.holdId, amount: submission.cost, skipped: reservation.skipped },
          },
          started_at: new Date().toISOString(),
        });
        if (insertError) {
          await releaseCredits({ supabase: userClient, holdId: reservation.holdId, skipped: reservation.skipped, amount: submission.cost, reason: 'job_insert_failed', userId, tokenId });
          throw new Error(`Could not record job: ${insertError.message}`);
        }

        const submit = await executeFalModel(submission.modelId, submission.inputs, 'queue');
        if (!submit.success || !submit.requestId) {
          await releaseCredits({ supabase: userClient, holdId: reservation.holdId, skipped: reservation.skipped, amount: submission.cost, reason: 'fal_submit_failed', userId, tokenId });
          await admin.from('generation_jobs').update({ status: 'failed', error_message: submit.error ?? 'fal submit failed', completed_at: new Date().toISOString() }).eq('id', jobId);
          safeLog('error', 'motion-splat.submit.failed', { stage, model: submission.modelId, error: submit.error });
          return errorResponse(submit.error ?? 'Failed to submit generation', 502);
        }

        const { error: linkError } = await admin
          .from('generation_jobs')
          .update({
            external_request_id: submit.requestId,
            progress: 10,
            config: {
              kind: MOTION_SPLAT_JOB_KIND,
              stage,
              client_request_id: clientRequestId,
              input: submission.summary,
              output_kind: submission.outputKind,
              credits: { hold_id: reservation.holdId, amount: submission.cost, skipped: reservation.skipped },
              fal: { request_id: submit.requestId, status_url: submit.statusUrl ?? null, response_url: submit.responseUrl ?? null, model: submission.modelId },
            },
          })
          .eq('id', jobId);
        if (linkError) {
          // Without the request id the job can never be polled, so fail it now
          // and refund rather than stranding the hold on an unreachable job.
          await releaseCredits({ supabase: userClient, holdId: reservation.holdId, skipped: reservation.skipped, amount: submission.cost, reason: 'job_link_failed', userId, tokenId });
          await admin.from('generation_jobs').update({ status: 'failed', error_message: 'Could not link the generation request', completed_at: new Date().toISOString() }).eq('id', jobId);
          safeLog('error', 'motion-splat.submit.link_failed', { jobId, stage, error: linkError.message });
          return errorResponse('Could not record the generation request; no credits were charged', 500);
        }

        safeLog('info', 'motion-splat.submit.ok', { stage, model: submission.modelId, jobId, requestId: submit.requestId });
        return successResponse({ jobId, stage, status: 'processing', progress: 10, requestId: submit.requestId, credits: submission.cost });
      }

      // ---------------------------------------------------------------- status
      case 'status': {
        const jobId = typeof body.jobId === 'string' ? body.jobId : '';
        if (!jobId) return errorResponse('jobId is required', 400);
        const { data: row, error: rowError } = await userClient
          .from('generation_jobs')
          .select('id, user_id, status, progress, config, result_url, result_payload, error_message, external_request_id, model_id, worker_id')
          .eq('id', jobId)
          .eq('user_id', userId)
          .maybeSingle();
        if (rowError || !row) return errorResponse('Job not found', 404);
        const config = asRecord(row.config);
        if (config.kind !== MOTION_SPLAT_JOB_KIND) return errorResponse('Job not found', 404);
        const stage = config.stage as MotionSplatStage;
        const outputKind = (config.output_kind as 'video' | 'splat') ?? 'video';
        const credits = asRecord(config.credits);

        if (row.status === 'completed') {
          return successResponse({ jobId, stage, status: 'completed', progress: 100, outputs: asRecord(row.result_payload) });
        }
        if (row.status === 'failed' || row.status === 'cancelled') {
          return successResponse({ jobId, stage, status: 'failed', progress: 100, error: row.error_message ?? 'Generation failed' });
        }
        if (!falKey) return errorResponse('Server configuration error: FAL_KEY not set', 500);

        const fal = asRecord(config.fal);
        const requestId = (row.external_request_id as string | null) ?? (fal.request_id as string | undefined);
        if (!requestId) return successResponse({ jobId, stage, status: 'processing', progress: row.progress ?? 5 });
        const statusUrl = typeof fal.status_url === 'string' ? fal.status_url : undefined;
        const responseUrl = typeof fal.response_url === 'string' ? fal.response_url : undefined;

        const poll = await pollFalStatus(requestId, statusUrl);
        if (!poll.success) {
          safeLog('warn', 'motion-splat.status.poll_failed', { jobId, error: poll.error });
          return successResponse({ jobId, stage, status: 'processing', progress: row.progress ?? 10 });
        }
        const state = normalizeFalStatus(poll.data?.status);
        const progress = progressForState(state, poll.data?.queue_position);

        if (state === 'queued' || state === 'processing') {
          if ((row.progress ?? 0) !== progress) await admin.from('generation_jobs').update({ progress }).eq('id', jobId);
          return successResponse({ jobId, stage, status: 'processing', progress, queuePosition: poll.data?.queue_position ?? null });
        }

        // Claim finalisation so concurrent status calls do not double-copy or
        // double-commit. The claim carries its timestamp: if the worker holding
        // it dies mid-copy, a later poller takes the claim over once the lease
        // expires instead of leaving the job processing forever.
        const now = Date.now();
        const previousClaim = typeof row.worker_id === 'string' ? row.worker_id : null;
        const claim = buildClaimToken(now, crypto.randomUUID());
        const claimQuery = admin.from('generation_jobs').update({ worker_id: claim }).eq('id', jobId);
        const { data: claimed } = await (previousClaim
          ? isClaimExpired(previousClaim, now)
            ? claimQuery.eq('worker_id', previousClaim)
            : claimQuery.eq('worker_id', '__never__')
          : claimQuery.is('worker_id', null)
        ).select('id');
        if (!claimed || claimed.length === 0) {
          return successResponse({ jobId, stage, status: 'processing', progress: 95 });
        }

        if (state === 'failed') {
          await releaseCredits({ supabase: userClient, holdId: (credits.hold_id as string | null) ?? null, skipped: credits.skipped === true, amount: Number(credits.amount ?? 0), reason: 'fal_failed', userId, tokenId });
          await admin.from('generation_jobs').update({ status: 'failed', progress: 100, error_message: `fal ${stage} generation failed`, completed_at: new Date().toISOString() }).eq('id', jobId);
          return successResponse({ jobId, stage, status: 'failed', progress: 100, error: `The ${stage} generation failed upstream` });
        }

        try {
          const result = await fetchFalResult(responseUrl, poll.data?.result, falKey);
          const primary = pickOutputFile(result, outputKind);
          if (!primary) throw new Error('No output file in the fal result');
          const ext = extensionFor(outputKind, primary);
          const files: Record<string, unknown>[] = [];
          const primaryCopy = await copyToStorage(primary, buildStoragePath(userId, jobId, `${stage}.${ext}`), outputKind);
          files.push({ kind: outputKind, ...primaryCopy });
          if (stage === 'triposplat') {
            const preview = pickOutputFile(result, 'image');
            if (preview) {
              try {
                const copy = await copyToStorage(preview, buildStoragePath(userId, jobId, `preview.${extensionFor('image', preview)}`), 'image');
                files.push({ kind: 'image', ...copy });
              } catch (previewError) {
                safeLog('warn', 'motion-splat.status.preview_copy_failed', { jobId, error: previewError });
              }
            }
          }
          const raw = asRecord(result);
          const outputs = {
            files,
            primary_url: primaryCopy.url,
            num_gaussians: typeof raw.num_gaussians === 'number' ? raw.num_gaussians : undefined,
            seed: typeof raw.seed === 'number' ? raw.seed : undefined,
          };
          await admin
            .from('generation_jobs')
            .update({ status: 'completed', progress: 100, result_url: primaryCopy.url, result_payload: outputs, completed_at: new Date().toISOString() })
            .eq('id', jobId);
          try {
            await commitCredits({ supabase: userClient, holdId: (credits.hold_id as string | null) ?? null, skipped: credits.skipped === true, amount: Number(credits.amount ?? 0), userId, tokenId, metadata: { endpoint: 'motion-splat', stage, job_id: jobId } });
          } catch (commitError) {
            // Outputs exist; a failed settlement must not lose them.
            safeLog('error', 'motion-splat.status.commit_failed', { jobId, error: commitError });
          }
          safeLog('info', 'motion-splat.status.completed', { jobId, stage, files: files.length });
          return successResponse({ jobId, stage, status: 'completed', progress: 100, outputs });
        } catch (finalizeError) {
          const message = finalizeError instanceof Error ? finalizeError.message : 'Failed to store outputs';
          await releaseCredits({ supabase: userClient, holdId: (credits.hold_id as string | null) ?? null, skipped: credits.skipped === true, amount: Number(credits.amount ?? 0), reason: 'finalize_failed', userId, tokenId });
          await admin.from('generation_jobs').update({ status: 'failed', progress: 100, error_message: message, completed_at: new Date().toISOString() }).eq('id', jobId);
          safeLog('error', 'motion-splat.status.finalize_failed', { jobId, error: finalizeError });
          return successResponse({ jobId, stage, status: 'failed', progress: 100, error: message });
        }
      }

      // -------------------------------------------------------------- manifest
      case 'manifest': {
        const manifest = asRecord(body.manifest);
        const track = asRecord(manifest.track);
        const source = asRecord(manifest.source);
        if (manifest.version !== 1 || typeof manifest.id !== 'string' || !manifest.id) return errorResponse('manifest.version must be 1 and manifest.id is required', 400);
        if (typeof track.kind !== 'string' || !isHttpUrl(source.videoUrl)) return errorResponse('manifest.track.kind and manifest.source.videoUrl are required', 400);
        const serialized = JSON.stringify(manifest);
        if (serialized.length > 512 * 1024) return errorResponse('manifest is too large', 413);
        const path = buildManifestPath(userId, manifest.id);
        const { error: uploadError } = await admin.storage
          .from(MOTION_SPLAT_BUCKET)
          .upload(path, new TextEncoder().encode(serialized), { contentType: 'application/json', upsert: true });
        if (uploadError) throw new Error(`Manifest upload failed: ${uploadError.message}`);
        const { data: urlData } = admin.storage.from(MOTION_SPLAT_BUCKET).getPublicUrl(path);
        const manifestUrl = urlData.publicUrl;
        const jobId = crypto.randomUUID();
        const payload = {
          manifest_id: manifest.id,
          title: typeof manifest.title === 'string' ? manifest.title : 'Untitled motion splat',
          provider: typeof manifest.provider === 'string' ? manifest.provider : 'depth-anything-video',
          track_kind: track.kind,
          duration: typeof manifest.duration === 'number' ? manifest.duration : 0,
          poster_url: typeof manifest.posterUrl === 'string' ? manifest.posterUrl : null,
          storage_path: path,
        };
        const { error: insertError } = await admin.from('generation_jobs').insert({
          id: jobId,
          user_id: userId,
          job_type: 'process',
          status: 'completed',
          progress: 100,
          model_id: typeof manifest.provider === 'string' ? manifest.provider : null,
          input_assets: [],
          config: { kind: MOTION_SPLAT_JOB_KIND, stage: 'manifest', manifest_id: manifest.id },
          result_url: manifestUrl,
          result_payload: payload,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });
        if (insertError) throw new Error(`Could not record manifest: ${insertError.message}`);
        return successResponse({ jobId, manifestUrl, storagePath: path });
      }

      // ---------------------------------------------------------------- cancel
      case 'cancel': {
        const jobId = typeof body.jobId === 'string' ? body.jobId : '';
        if (!jobId) return errorResponse('jobId is required', 400);
        const { data: row, error: rowError } = await userClient
          .from('generation_jobs')
          .select('id, status, config, worker_id')
          .eq('id', jobId)
          .eq('user_id', userId)
          .maybeSingle();
        if (rowError || !row) return errorResponse('Job not found', 404);
        const config = asRecord(row.config);
        if (config.kind !== MOTION_SPLAT_JOB_KIND) return errorResponse('Job not found', 404);
        const stage = config.stage as MotionSplatStage;
        if (row.status !== 'processing') {
          return successResponse({ jobId, stage, status: row.status === 'completed' ? 'completed' : 'failed', progress: 100, cancelled: false });
        }
        // Take the finalisation claim first: a poller that is already storing
        // outputs owns the hold, and cancelling underneath it would refund work
        // the user is about to receive.
        const now = Date.now();
        const previousClaim = typeof row.worker_id === 'string' ? row.worker_id : null;
        const claim = buildClaimToken(now, crypto.randomUUID());
        const claimQuery = admin.from('generation_jobs').update({ worker_id: claim }).eq('id', jobId);
        const { data: claimed } = await (previousClaim
          ? isClaimExpired(previousClaim, now)
            ? claimQuery.eq('worker_id', previousClaim)
            : claimQuery.eq('worker_id', '__never__')
          : claimQuery.is('worker_id', null)
        ).select('id');
        if (!claimed || claimed.length === 0) {
          return successResponse({ jobId, stage, status: 'processing', progress: 95, cancelled: false });
        }
        const credits = asRecord(config.credits);
        await releaseCredits({ supabase: userClient, holdId: (credits.hold_id as string | null) ?? null, skipped: credits.skipped === true, amount: Number(credits.amount ?? 0), reason: 'cancelled_by_user', userId, tokenId });
        await admin
          .from('generation_jobs')
          .update({ status: 'cancelled', progress: 100, error_message: 'Cancelled', completed_at: new Date().toISOString() })
          .eq('id', jobId);
        safeLog('info', 'motion-splat.cancel.ok', { jobId, stage });
        return successResponse({ jobId, stage, status: 'failed', progress: 100, cancelled: true, error: 'Cancelled' });
      }

      // ------------------------------------------------------------------ list
      case 'list': {
        const limit = clampListLimit(body.limit);
        const { data, error } = await userClient
          .from('generation_jobs')
          .select('id, status, created_at, completed_at, result_url, result_payload, config, model_id')
          .eq('user_id', userId)
          .eq('config->>kind', MOTION_SPLAT_JOB_KIND)
          .eq('config->>stage', 'manifest')
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        const items = ((data ?? []) as MotionSplatJobRow[]).map((row) => toJobSummary(row)).filter(Boolean);
        return successResponse({ items });
      }

      default:
        return errorResponse(`Unknown action: ${action || '(missing)'}`, 400);
    }
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return insufficientCreditsResponse(error, corsHeaders);
    }
    safeLog('error', 'motion-splat.error', { action, error });
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return errorResponse(message, 500);
  }
});
