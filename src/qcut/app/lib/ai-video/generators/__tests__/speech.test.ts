import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecuteFalStream, mockMakeFalRequest, mockPlatform } = vi.hoisted(() => ({
  mockExecuteFalStream: vi.fn(),
  mockMakeFalRequest: vi.fn(),
  mockPlatform: vi.fn(),
}));

vi.mock("@qcut/platform-core", () => ({
  platform: mockPlatform,
}));

vi.mock("@/services/unifiedGenerationService", () => ({
  executeFalStream: mockExecuteFalStream,
  normalizeFalSpeechResult: (result: unknown, defaults: { contentType: string; fileName: string }) => {
    const root = result as Record<string, unknown>;
    const audio = root.audio && typeof root.audio === "object"
      ? root.audio as Record<string, unknown>
      : root;
    return {
      audioUrl: audio.url,
      contentType: audio.content_type ?? defaults.contentType,
      fileName: audio.file_name ?? defaults.fileName,
      fileSize: audio.file_size,
      duration: audio.duration,
      sampleRate: audio.sample_rate,
    };
  },
}));

vi.mock("../../core/fal-request", () => ({
  getFalApiKeyAsync: vi.fn(),
  generateJobId: () => "job-test",
  makeFalRequest: mockMakeFalRequest,
  handleFalResponse: vi.fn(),
}));

import {
  generateElevenLabsSpeech,
  generateQwen3Speech,
  generateSpeech,
} from "../speech";

describe("speech generators", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue({ isElectron: false });
    mockExecuteFalStream.mockResolvedValue({
      result: {
        audio: {
          url: "https://audio.test/nested.wav",
          content_type: "audio/wav",
          file_name: "nested.wav",
        },
      },
    });
    mockMakeFalRequest.mockImplementation(async () =>
      new Response(JSON.stringify({ url: "https://audio.test/direct.wav" }), { status: 200 })
    );
  });

  it("routes browser Chatterbox TTS through fal-stream with strict pricing and merged payload", async () => {
    const result = await generateSpeech({
      endpoint: "fal-ai/chatterbox/text-to-speech",
      text: "hello",
      exaggeration: 0.4,
    });

    expect(result.audioUrl).toBe("https://audio.test/nested.wav");
    expect(mockExecuteFalStream).toHaveBeenCalledWith(
      "fal-ai/chatterbox/text-to-speech",
      { text: "hello", exaggeration: 0.4 },
      undefined,
      "catalog-strict"
    );
    expect(mockMakeFalRequest).not.toHaveBeenCalled();
  });

  it("normalizes a top-level browser ElevenLabs result", async () => {
    mockExecuteFalStream.mockResolvedValueOnce({
      result: { url: "https://audio.test/top-level.mp3" },
    });

    const result = await generateElevenLabsSpeech({
      endpoint: "fal-ai/elevenlabs/tts/eleven-v3",
      text: "hello",
    });

    expect(result).toMatchObject({
      audioUrl: "https://audio.test/top-level.mp3",
      contentType: "audio/mpeg",
      fileName: "output.mp3",
    });
  });

  it("keeps upload-based Qwen and Electron paths on the existing Fal request route", async () => {
    await generateQwen3Speech({
      endpoint: "fal-ai/qwen-3-tts/text-to-speech/1.7b",
      text: "hello",
      speakerEmbeddingUrl: "https://audio.test/embedding.safetensors",
    });
    expect(mockExecuteFalStream).not.toHaveBeenCalled();
    expect(mockMakeFalRequest).toHaveBeenCalled();

    vi.clearAllMocks();
    mockPlatform.mockReturnValue({ isElectron: true });
    await generateSpeech({
      endpoint: "fal-ai/chatterbox/text-to-speech",
      text: "desktop hello",
    });
    expect(mockExecuteFalStream).not.toHaveBeenCalled();
    expect(mockMakeFalRequest).toHaveBeenCalled();
  });
});
