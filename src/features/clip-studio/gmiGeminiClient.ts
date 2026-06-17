import type { GmiChatContentPart, GmiChatMessage } from '@/lib/gmiCloud';
import { supabase } from '@/integrations/supabase/client';
import type { GmiGeminiSettings } from './types';

export interface GmiGeminiChatRequest {
  model: string;
  messages: GmiChatMessage[];
  temperature: number;
  max_tokens: number;
  response_format: { type: 'json_object' };
}

export interface GmiGeminiClientOptions {
  fetchImpl?: typeof fetch;
  invokeFunction?: SupabaseFunctionInvoker;
}

export type SupabaseFunctionInvoker = (
  name: string,
  options: { body: GmiGeminiChatRequest },
) => Promise<{ data: unknown; error: unknown }>;

export class GmiGeminiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'GmiGeminiError';
  }
}

export function buildGmiGeminiChatRequest(
  settings: GmiGeminiSettings,
  messages: GmiChatMessage[],
): GmiGeminiChatRequest {
  return {
    model: settings.model,
    messages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    response_format: { type: 'json_object' },
  };
}

function stripMarkdownJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function repairJsonContent(content: string): string {
  const stripped = stripMarkdownJsonFence(content);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const extracted = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  return extracted.replace(/,\s*([}\]])/g, '$1');
}

export function parseJsonWithRepair(content: string): { value: unknown; repaired: boolean } {
  try {
    return { value: JSON.parse(stripMarkdownJsonFence(content)), repaired: false };
  } catch {
    try {
      return { value: JSON.parse(repairJsonContent(content)), repaired: true };
    } catch {
      throw new GmiGeminiError('Analysis service returned invalid JSON after one repair attempt.', 'invalid-json');
    }
  }
}

export function extractGmiGeminiMessageContent(responseJson: unknown): string {
  const root = responseJson && typeof responseJson === 'object' ? (responseJson as Record<string, unknown>) : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const first = choices[0] && typeof choices[0] === 'object' ? (choices[0] as Record<string, unknown>) : {};
  const message = first.message && typeof first.message === 'object' ? (first.message as Record<string, unknown>) : {};
  const content = readTextContent(message.content) ?? readStringField(first, ['text']);
  if (!content) {
    throw new GmiGeminiError('Analysis service returned an unsupported response shape for Clipper analysis.', 'unsupported-response');
  }
  return content;
}

function hasClipperJsonShape(value: unknown): boolean {
  const root = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return Array.isArray(root.clipCandidates)
    || typeof root.sourceSummary === 'string'
    || Array.isArray(root.topFiveMustCut)
    || Array.isArray(root.suggestedPostingOrder);
}

function readTextContent(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;

  const text = value
    .map((part) => {
      if (typeof part === 'string') return part;
      const record = part && typeof part === 'object' ? (part as Record<string, unknown>) : {};
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter((part) => part.trim())
    .join('\n')
    .trim();

  return text || undefined;
}

export function normalizeGmiGeminiResponseJson(responseJson: unknown): { value: unknown; repaired: boolean } {
  if (typeof responseJson === 'string') {
    return parseJsonWithRepair(responseJson);
  }

  if (hasClipperJsonShape(responseJson)) {
    return { value: responseJson, repaired: false };
  }

  const content = extractGmiGeminiMessageContent(responseJson);
  return parseJsonWithRepair(content);
}

function readErrorStatus(error: unknown): number | undefined {
  const root = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  if (typeof root.status === 'number') return root.status;
  const context = root.context && typeof root.context === 'object' ? (root.context as Record<string, unknown>) : {};
  if (typeof context.status === 'number') return context.status;
  return undefined;
}

function isResponseLike(value: unknown): value is Response {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as Response).clone === 'function'
      && typeof (value as Response).json === 'function',
  );
}

function readStringField(value: unknown, keys: string[]): string | undefined {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  for (const key of keys) {
    const field = root[key];
    if (typeof field === 'string' && field.trim()) {
      return field.trim();
    }
  }
  return undefined;
}

function readNestedProviderError(value: unknown): string | undefined {
  const root = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const details = root.details && typeof root.details === 'object' ? (root.details as Record<string, unknown>) : {};
  return readStringField(details, ['providerError', 'error', 'message']);
}

async function readErrorMessage(error: unknown): Promise<string> {
  const root = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  if (isResponseLike(root.context)) {
    try {
      const payload = await root.context.clone().json();
      const nestedProviderError = readNestedProviderError(payload);
      if (nestedProviderError) return nestedProviderError;
      const payloadMessage = readStringField(payload, ['error', 'message', 'error_description']);
      if (payloadMessage) return payloadMessage;
    } catch {
      try {
        const text = await root.context.clone().text();
        if (text.trim()) return text.trim().slice(0, 240);
      } catch {
        // Fall through to object and Error message parsing.
      }
    }
  }
  if (error instanceof Error && error.message) return error.message;
  for (const key of ['message', 'error', 'error_description']) {
    const value = root[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'Viral analysis service failed.';
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: number | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new GmiGeminiError('Viral analysis timed out. Increase timeout or analyze a smaller context package.', 'timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function runDirectBrowserRequest(
  settings: GmiGeminiSettings,
  request: GmiGeminiChatRequest,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  if (!settings.apiKey.trim()) {
    throw new GmiGeminiError('A browser API key is required for direct browser analysis. The app normally uses Supabase-hosted analysis.', 'missing-api-key');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), settings.timeoutMs);

  try {
    const response = await fetchImpl(settings.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const statusMessage =
        response.status === 401
          ? 'Analysis service rejected the browser API key.'
          : response.status === 429
            ? 'Analysis service rate limit reached. Wait and retry.'
            : response.status >= 500
              ? 'Analysis service error. Retry shortly.'
              : 'Analysis request failed.';
      throw new GmiGeminiError(`${statusMessage}${text ? ` ${text.slice(0, 180)}` : ''}`, 'api-error', response.status);
    }

    return response.json();
  } catch (error) {
    if (error instanceof GmiGeminiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new GmiGeminiError('Viral analysis timed out. Increase timeout or analyze a smaller context package.', 'timeout');
    }
    throw new GmiGeminiError(error instanceof Error ? error.message : 'Analysis request failed.', 'network-error');
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function gmiGeminiClient(
  settings: GmiGeminiSettings,
  messages: GmiChatMessage[],
  options: GmiGeminiClientOptions = {},
): Promise<{ json: unknown; repaired: boolean; request: GmiGeminiChatRequest }> {
  const request = buildGmiGeminiChatRequest(settings, messages);

  try {
    const payload = options.fetchImpl
      ? await runDirectBrowserRequest(settings, request, options.fetchImpl)
      : await (async () => {
          const invokeFunction = options.invokeFunction ?? ((name, invokeOptions) => supabase.functions.invoke(name, invokeOptions));
          const { data, error } = await runWithTimeout(invokeFunction('clipper-analyze', { body: request }), settings.timeoutMs);
          if (error) {
            throw new GmiGeminiError(await readErrorMessage(error), 'api-error', readErrorStatus(error));
          }
          return data;
        })();
    const parsed = normalizeGmiGeminiResponseJson(payload);
    return { json: parsed.value, repaired: parsed.repaired, request };
  } catch (error) {
    if (error instanceof GmiGeminiError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new GmiGeminiError('Viral analysis timed out. Increase timeout or analyze a smaller context package.', 'timeout');
    }
    throw new GmiGeminiError(error instanceof Error ? error.message : 'Analysis request failed.', 'network-error');
  }
}

export function textPart(text: string): GmiChatContentPart {
  return { type: 'text', text };
}
