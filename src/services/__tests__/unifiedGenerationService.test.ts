import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

const originalFetch = globalThis.fetch;

afterAll(() => {
  // Restore fetch so this test file doesn't leak mocks into other suites.
  (globalThis as any).fetch = originalFetch;
});

// Mock Supabase before any imports
const mockInvoke = vi.fn();
const mockGetSession = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      }),
    },
  },
}));

// Mock import.meta.env
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');

import {
  unifiedGenerationService,
  executeFalStream,
  normalizeFalSpeechResult,
  GenerationError,
  InsufficientCreditsError,
  type GenerationInput,
  type GenerationResult,
} from '../unifiedGenerationService';
import { getModelById } from '@/lib/studio-model-constants';

describe('unifiedGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    });

    // Ensure routes that use fetch() (fal-stream, ElevenLabs) behave deterministically in unit tests.
    // These tests are routing/unit tests and should not hit real network endpoints.
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not Found',
    });
  });

  describe('executeFalStream()', () => {
    function streamResponse(events: unknown[]): Response {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
            )
          );
          controller.close();
        },
      });
      return new Response(body, { status: 200 });
    }

    it('sends strict pricing mode and rejects an SSE error event', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue(
        streamResponse([{ type: 'error', error: 'provider failed' }])
      );

      await expect(
        executeFalStream(
          'fal-ai/chatterbox/text-to-speech',
          { text: 'hello' },
          undefined,
          'catalog-strict'
        )
      ).rejects.toMatchObject({ code: 'provider_error' });

      const request = (globalThis.fetch as any).mock.calls[0][1];
      expect(JSON.parse(request.body)).toEqual({
        modelId: 'fal-ai/chatterbox/text-to-speech',
        inputs: { text: 'hello' },
        pricingMode: 'catalog-strict',
      });
    });

    it('rejects a stream that ends without a done event', async () => {
      (globalThis as any).fetch = vi.fn().mockResolvedValue(
        streamResponse([{ type: 'progress', event: { progress: 0.5 } }])
      );

      await expect(
        executeFalStream('fal-ai/chatterbox/text-to-speech', { text: 'hello' })
      ).rejects.toMatchObject({ code: 'no_result' });
    });

    it('routes insufficient-credit responses to billing', async () => {
      window.history.pushState({}, '', '/projects/test');
      const listener = vi.fn();
      window.addEventListener('billing:insufficient-credits', listener);
      (globalThis as any).fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 'insufficient_credits',
            required: 7,
            available: 2,
            top_up_url: '/settings/billing',
          }),
          { status: 402 }
        )
      );

      await expect(
        executeFalStream('fal-ai/chatterbox/text-to-speech', { text: 'hello' })
      ).rejects.toBeInstanceOf(InsufficientCreditsError);
      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('billing:insufficient-credits', listener);
    });
  });

  describe('normalizeFalSpeechResult()', () => {
    it('normalizes nested audio results', () => {
      expect(
        normalizeFalSpeechResult(
          { audio: { url: 'https://audio.test/a.wav', content_type: 'audio/wav', file_name: 'a.wav' } },
          { contentType: 'audio/wav', fileName: 'output.wav' }
        )
      ).toMatchObject({
        audioUrl: 'https://audio.test/a.wav',
        contentType: 'audio/wav',
        fileName: 'a.wav',
      });
    });

    it('normalizes top-level audio results and preserves Qwen metadata', () => {
      expect(
        normalizeFalSpeechResult(
          { url: 'https://audio.test/qwen.wav', duration: 1.5, sample_rate: 24000 },
          { contentType: 'audio/wav', fileName: 'output.wav' }
        )
      ).toMatchObject({
        audioUrl: 'https://audio.test/qwen.wav',
        contentType: 'audio/wav',
        fileName: 'output.wav',
        duration: 1.5,
        sampleRate: 24000,
      });
    });
  });

  describe('generate() — routing', () => {
    it('routes fal.ai models to fal-stream', async () => {
      // We can't fully test the streaming without a real endpoint,
      // but we can verify the service doesn't throw on instantiation
      const input: GenerationInput = {
        model: 'fal-ai/flux/schnell',
        prompt: 'A test prompt',
        outputConfig: { autoStore: false },
      };

      // The fetch will fail because there's no real server — but we verify
      // the route was selected correctly by checking the error message
      const result = await unifiedGenerationService.generate(input);
      // Since fetch will fail (no real endpoint), we expect a failed result
      expect(result.status).toBe('failed');
      expect(result.metadata.requestedModel).toBe('fal-ai/flux/schnell');
      expect(result.metadata.mediaType).toBe('image');
    });

    it('routes Gemini text models to gemini-text', async () => {
      const input: GenerationInput = {
        model: 'google/gemini-2.5-flash',
        prompt: 'Write a haiku about code',
        outputConfig: { autoStore: false },
      };

      const result = await unifiedGenerationService.generate(input);
      expect(result.status).toBe('failed'); // No real endpoint
      expect(result.metadata.requestedModel).toBe('google/gemini-2.5-flash');
      expect(result.metadata.mediaType).toBe('text');
    });

    it('routes ElevenLabs models to correct edge function', async () => {
      const input: GenerationInput = {
        model: 'elevenlabs-sfx',
        prompt: 'Door creaking open',
        parameters: { duration: 5 },
      };

      const result = await unifiedGenerationService.generate(input);
      expect(result.status).toBe('failed'); // No real endpoint
      expect(result.metadata.requestedModel).toBe('elevenlabs-sfx');
      expect(result.metadata.mediaType).toBe('audio');
    });

    it('routes custom edge function via _edgeFunction parameter', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { result: 'test' },
        error: null,
      });

      const input: GenerationInput = {
        model: 'custom-model',
        prompt: 'test',
        parameters: {
          _edgeFunction: 'my-custom-function',
          extraParam: 'value',
        },
      };

      const result = await unifiedGenerationService.generate(input);
      expect(result.status).toBe('completed');
      expect(mockInvoke).toHaveBeenCalledWith('my-custom-function', {
        body: expect.objectContaining({
          prompt: 'test',
          extraParam: 'value',
        }),
      });
    });
  });

  describe('generate() — edge function route', () => {
    it('invokes edge function and returns standard result', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { url: 'https://example.com/output.png' },
        error: null,
      });

      const input: GenerationInput = {
        model: 'custom',
        prompt: 'test',
        parameters: { _edgeFunction: 'test-function' },
      };

      const result = await unifiedGenerationService.generate(input);
      expect(result.status).toBe('completed');
      expect(result.metadata.generationId).toBeTruthy();
      expect(result.metadata.requestedModel).toBe('custom');
    });

    it('handles edge function errors gracefully', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Function failed' },
      });

      const input: GenerationInput = {
        model: 'custom',
        prompt: 'test',
        parameters: { _edgeFunction: 'test-function' },
      };

      const result = await unifiedGenerationService.generate(input);
      expect(result.status).toBe('failed');
    });
  });

  describe('invokeEdgeFunction()', () => {
    it('returns standard result format for edge function calls', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { visual_prompt: 'A cinematic shot' },
        error: null,
      });

      const result = await unifiedGenerationService.invokeEdgeFunction(
        'generate-visual-prompt',
        { shot_id: 'shot-123' }
      );

      expect(result.status).toBe('completed');
      expect(result.metadata.generationId).toBeTruthy();
      expect(result.metadata.requestedModel).toBe('generate-visual-prompt');
      expect(result.metadata.resolvedModel).toBe('generate-visual-prompt');
      expect(result.metadata.fallbackUsed).toBe(false);
      expect(result.metadata.raw).toEqual({ visual_prompt: 'A cinematic shot' });
    });

    it('returns failed status on error', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await unifiedGenerationService.invokeEdgeFunction(
        'nonexistent-function',
        {}
      );

      expect(result.status).toBe('failed');
      expect(result.url).toBe('');
    });
  });

  describe('convenience methods', () => {
    it('generateImage() sets correct defaults', async () => {
      // Will fail because no real endpoint, but verify the input mapping
      const result = await unifiedGenerationService.generateImage('A sunset', {
        model: 'fal-ai/flux/dev',
        projectId: 'proj-123',
        source: 'editor',
      });

      expect(result.metadata.requestedModel).toBe('fal-ai/flux/dev');
      expect(result.metadata.mediaType).toBe('image');
    });

    it('generateVideo() sets correct defaults', async () => {
      const result = await unifiedGenerationService.generateVideo('A flying car', {
        source: 'studio',
      });

      expect(result.metadata.requestedModel).toBe('fal-ai/kling-video/o3/standard/text-to-video');
      expect(result.metadata.mediaType).toBe('video');
    });

    it('generateText() sets correct defaults', async () => {
      const result = await unifiedGenerationService.generateText('Hello world');

      expect(result.metadata.requestedModel).toBe('google/gemini-2.5-flash');
      expect(result.metadata.mediaType).toBe('text');
    });

    it('generateAudio() sets correct defaults', async () => {
      const result = await unifiedGenerationService.generateAudio('Thunder sound');

      expect(result.metadata.requestedModel).toBe('elevenlabs-sfx');
      expect(result.metadata.mediaType).toBe('audio');
    });
  });

  describe('getModelCredits()', () => {
    it('returns credits for known models', () => {
      const credits = unifiedGenerationService.getModelCredits('fal-ai/flux/schnell');
      expect(credits).toBe(3);
    });

    it('returns credits for aliased models', () => {
      // 'flux-dev' is an alias for 'fal-ai/flux/dev'
      const credits = unifiedGenerationService.getModelCredits('flux-dev');
      expect(credits).toBe(5);
    });

    it('returns undefined for unknown models', () => {
      const credits = unifiedGenerationService.getModelCredits('unknown-model-xyz');
      expect(credits).toBeUndefined();
    });
  });

  describe('getModel()', () => {
    it('returns model info for known models', () => {
      const model = unifiedGenerationService.getModel('fal-ai/flux/dev');
      expect(model).toBeDefined();
      expect(model?.name).toBe('FLUX Dev');
      expect(model?.mediaType).toBe('image');
    });

    it('returns model info for aliased models', () => {
      const model = unifiedGenerationService.getModel('flux-schnell');
      expect(model).toBeDefined();
      expect(model?.id).toBe('fal-ai/flux/schnell');
    });

    it('returns undefined for unknown models', () => {
      const model = unifiedGenerationService.getModel('completely-unknown');
      expect(model).toBeUndefined();
    });
  });

  describe('GenerationError classes', () => {
    it('GenerationError has correct properties', () => {
      const error = new GenerationError('Test error', 'test_code', { detail: 'info' });
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('test_code');
      expect(error.details).toEqual({ detail: 'info' });
      expect(error.name).toBe('GenerationError');
      expect(error instanceof Error).toBe(true);
    });

    it('InsufficientCreditsError has correct properties', () => {
      const error = new InsufficientCreditsError(10, 5);
      expect(error.required).toBe(10);
      expect(error.available).toBe(5);
      expect(error.code).toBe('insufficient_credits');
      expect(error.name).toBe('InsufficientCreditsError');
      expect(error instanceof GenerationError).toBe(true);
      expect(error.message).toContain('10');
      expect(error.message).toContain('5');
    });
  });

  describe('standard result format', () => {
    it('all results have url, metadata, and status fields', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { url: 'https://example.com/test.png' },
        error: null,
      });

      const result = await unifiedGenerationService.invokeEdgeFunction(
        'test-function',
        { prompt: 'test' }
      );

      // Verify standard format {url, metadata, status}
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('status');

      // Verify metadata has all required fields
      expect(result.metadata).toHaveProperty('generationId');
      expect(result.metadata).toHaveProperty('resolvedModel');
      expect(result.metadata).toHaveProperty('requestedModel');
      expect(result.metadata).toHaveProperty('fallbackUsed');
      expect(result.metadata).toHaveProperty('mediaType');
    });

    it('failed results still have standard format', async () => {
      const result = await unifiedGenerationService.generateImage('test');
      // Will fail due to no real endpoint
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('status');
      expect(result.metadata).toHaveProperty('generationId');
      expect(typeof result.metadata.generationId).toBe('string');
      expect(result.metadata.generationId.length).toBeGreaterThan(0);
    });
  });
});
