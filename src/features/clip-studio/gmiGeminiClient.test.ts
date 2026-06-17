import { describe, expect, it, vi } from 'vitest';

import {
  buildGmiGeminiChatRequest,
  extractGmiGeminiMessageContent,
  gmiGeminiClient,
  parseJsonWithRepair,
} from './gmiGeminiClient';
import { DEFAULT_GMI_GEMINI_SETTINGS } from './settings';

describe('GMI Gemini chat client helpers', () => {
  it('constructs the OpenAI-compatible request with the required endpoint model defaults', () => {
    const request = buildGmiGeminiChatRequest(DEFAULT_GMI_GEMINI_SETTINGS, [
      { role: 'system', content: 'Return JSON.' },
      { role: 'user', content: 'Analyze this.' },
    ]);

    expect(DEFAULT_GMI_GEMINI_SETTINGS.baseUrl).toBe('https://api.gmi-serving.com/v1/chat/completions');
    expect(request).toMatchObject({
      model: 'google/gemini-3.5-flash',
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    });
  });

  it('reads response.choices[0].message.content', () => {
    expect(
      extractGmiGeminiMessageContent({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    ).toBe('{"ok":true}');
  });

  it('repairs fenced JSON with trailing commas in one local repair pass', () => {
    const parsed = parseJsonWithRepair('```json\n{"clipCandidates":[{"title":"A",}],}\n```');

    expect(parsed.repaired).toBe(true);
    expect(parsed.value).toEqual({ clipCandidates: [{ title: 'A' }] });
  });

  it('invokes the Supabase clipper analysis function without requiring a client API key', async () => {
    const invokeFunction = vi.fn(async () => ({
      data: {
        choices: [{ message: { content: '{"clipCandidates":[]}' } }],
      },
      error: null,
    }));

    const result = await gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [
      { role: 'system', content: 'Return JSON.' },
      { role: 'user', content: 'Analyze this.' },
    ], { invokeFunction } as never);

    expect(invokeFunction).toHaveBeenCalledWith('clipper-analyze', {
      body: expect.objectContaining({
        model: 'google/gemini-3.5-flash',
        max_tokens: 8192,
        response_format: { type: 'json_object' },
      }),
    });
    expect(result.json).toEqual({ clipCandidates: [] });
  });

  it('accepts direct Clipper JSON payloads returned by the Supabase function', async () => {
    const invokeFunction = vi.fn(async () => ({
      data: {
        sourceSummary: 'Already normalized by the edge function.',
        clipCandidates: [],
      },
      error: null,
    }));

    const result = await gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], { invokeFunction } as never);

    expect(result.json).toEqual({
      sourceSummary: 'Already normalized by the edge function.',
      clipCandidates: [],
    });
    expect(result.repaired).toBe(false);
  });

  it('accepts choices text and message content arrays from provider variants', async () => {
    const textChoice = await gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], {
      invokeFunction: vi.fn(async () => ({
        data: { choices: [{ text: '{"clipCandidates":[]}' }] },
        error: null,
      })),
    } as never);
    expect(textChoice.json).toEqual({ clipCandidates: [] });

    const contentArray = await gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], {
      invokeFunction: vi.fn(async () => ({
        data: { choices: [{ message: { content: [{ type: 'text', text: '{"clipCandidates":[]}' }] } }] },
        error: null,
      })),
    } as never);
    expect(contentArray.json).toEqual({ clipCandidates: [] });
  });

  it('reports unsupported provider response shapes with a friendly Clipper error', async () => {
    const invokeFunction = vi.fn(async () => ({
      data: { choices: [{ message: { role: 'assistant' } }] },
      error: null,
    }));

    await expect(
      gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], { invokeFunction } as never),
    ).rejects.toMatchObject({
      code: 'unsupported-response',
      message: expect.stringMatching(/unsupported response/i),
    });
  });

  it('maps Supabase function errors to a friendly API error', async () => {
    const invokeFunction = vi.fn(async () => ({
      data: null,
      error: { message: 'Gemini quota exhausted', status: 429 },
    }));

    await expect(
      gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], { invokeFunction } as never),
    ).rejects.toMatchObject({
      code: 'api-error',
      status: 429,
      message: expect.stringMatching(/quota exhausted/i),
    });
  });

  it('reads Supabase Edge Function error bodies from FunctionsHttpError context', async () => {
    const invokeFunction = vi.fn(async () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(
          JSON.stringify({
            error: 'Gemini analysis provider error',
            details: { providerError: 'Server Gemini credentials were rejected.' },
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        ),
      },
    }));

    await expect(
      gmiGeminiClient(DEFAULT_GMI_GEMINI_SETTINGS, [], { invokeFunction } as never),
    ).rejects.toMatchObject({
      code: 'api-error',
      status: 502,
      message: 'Server Gemini credentials were rejected.',
    });
  });

  it('maps GMI rate limits to a friendly API error', async () => {
    const fetchImpl: typeof fetch = async () => new Response('try later', { status: 429 });

    await expect(
      gmiGeminiClient({ ...DEFAULT_GMI_GEMINI_SETTINGS, apiKey: 'test-key' }, [], { fetchImpl }),
    ).rejects.toMatchObject({
      code: 'api-error',
      status: 429,
      message: expect.stringMatching(/rate limit/i),
    });
  });

  it('maps request aborts to a timeout error', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl: typeof fetch = async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });

      const request = gmiGeminiClient(
        { ...DEFAULT_GMI_GEMINI_SETTINGS, apiKey: 'test-key', timeoutMs: 50 },
        [],
        { fetchImpl },
      );
      const expectation = expect(request).rejects.toMatchObject({
        code: 'timeout',
        message: expect.stringMatching(/timed out/i),
      });

      await vi.advanceTimersByTimeAsync(50);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
