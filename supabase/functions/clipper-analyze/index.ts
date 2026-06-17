import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { errorResponse, handleCors, successResponse } from '../_shared/response.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import type { GmiChatMessage } from '../_shared/gmi-types.ts';

interface ClipperAnalyzeRequest {
  model?: string;
  messages?: GmiChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type?: string };
}

function isValidMessage(value: unknown): value is GmiChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const message = value as Record<string, unknown>;
  const role = message.role;
  const content = message.content;
  return typeof role === 'string' && (typeof content === 'string' || Array.isArray(content));
}

function asFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatProviderError(error: string | undefined): string {
  if (!error) {
    return 'Provider returned no chat completion data.';
  }
  if (/authentication failed/i.test(error)) {
    return 'Server Gemini credentials were rejected. Update the Supabase Edge Function secret with a valid Gemini API key.';
  }
  return error;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  try {
    const body: ClipperAnalyzeRequest = await req.json();
    const messages = Array.isArray(body.messages) ? body.messages.filter(isValidMessage) : [];
    if (messages.length === 0) {
      return errorResponse('messages are required', 400);
    }

    const model = typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : 'google/gemini-3.5-flash';
    const maxTokens = Math.max(256, Math.min(32768, asFiniteNumber(body.max_tokens, 8192)));
    const temperature = Math.max(0, Math.min(2, asFiniteNumber(body.temperature, 0)));

    const result = await executeGmiChatCompletion(model, messages, {
      max_tokens: maxTokens,
      temperature,
      stream: false,
    });

    if (!result.success || !result.data) {
      return errorResponse('Gemini analysis provider error', 502, {
        providerError: formatProviderError(result.error),
        model,
      });
    }

    return successResponse(result.data);
  } catch (error) {
    console.error('[clipper-analyze] execution error', error);
    return errorResponse('Gemini analysis request failed', 500);
  }
});
