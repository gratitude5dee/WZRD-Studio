import { Daytona, Image } from "https://esm.sh/@daytona/sdk@0.175.0";

import {
  DAYTONA_AGENT_DEFAULTS,
  DAYTONA_AGENT_ENV,
  getOptionalEnv,
  getRequiredEnv,
} from "./constants.ts";
import type { AgentFileEntry, DaytonaAgentSession } from "./types.ts";
import {
  joinSandboxPath,
  normalizeFilename,
  normalizeSandboxPath,
} from "./validation.ts";

type DaytonaClient = InstanceType<typeof Daytona>;
type DaytonaSandbox = Awaited<ReturnType<DaytonaClient["get"]>>;
type DaytonaProcessApi = {
  executeCommand?: (
    command: string,
    cwd?: string,
    env?: unknown,
    timeout?: number,
  ) => Promise<unknown>;
};
type DaytonaFileInfo = {
  name?: string;
  size?: number;
  isDir?: boolean;
};
type DaytonaDownloadHeaders = Record<string, string | string[] | undefined>;
type DaytonaDownloadResponse = {
  data: unknown;
  headers?: DaytonaDownloadHeaders;
};
type DaytonaFsApi = {
  apiClient?: {
    downloadFiles?: (
      body: { paths: string[] },
      options: { responseType: "arraybuffer"; timeout: number },
    ) => Promise<DaytonaDownloadResponse>;
  };
  listFiles?: (path: string) => Promise<DaytonaFileInfo[]>;
  createFolder?: (path: string, mode?: string) => Promise<unknown>;
  uploadFile?: (
    bytes: Uint8Array,
    path: string,
    timeout?: number,
  ) => Promise<unknown>;
  downloadFile?: (path: string, timeout?: number) => Promise<unknown>;
};
type DaytonaSandboxApis = {
  process?: DaytonaProcessApi;
  fs?: DaytonaFsApi;
};
type MultipartPart = {
  name: string | null;
  filename: string | null;
  headers: Record<string, string>;
  data: Uint8Array;
};

const MULTIPART_HEADER_SEPARATOR = "\r\n\r\n";
const MULTIPART_LINE_ENDING = "\r\n";

export function createDaytonaClient(): DaytonaClient {
  const apiKey = getRequiredEnv(DAYTONA_AGENT_ENV.apiKey);
  const apiUrl = getOptionalEnv(DAYTONA_AGENT_ENV.apiUrl);
  return new Daytona(apiUrl ? ({ apiKey, apiUrl } as never) : { apiKey });
}

export async function createSandbox(): Promise<{ sandboxId: string }> {
  const image = getRequiredEnv(DAYTONA_AGENT_ENV.image);
  const sandboxEnv = buildSandboxEnv();
  const daytona = createDaytonaClient();
  const createClient = daytona as unknown as {
    sandboxApi?: {
      createSandbox: (
        body: Record<string, unknown>,
        organizationId?: unknown,
        options?: { timeout?: number },
      ) => Promise<{ data?: { id?: string } }>;
    };
    target?: string;
    create?: (
      params: Record<string, unknown>,
      options?: { timeout?: number },
    ) => Promise<{ id: string }>;
  };

  if (createClient.sandboxApi?.createSandbox) {
    const response = await createClient.sandboxApi.createSandbox(
      {
        buildInfo: { dockerfileContent: Image.base(image).dockerfile },
        env: sandboxEnv,
        labels: { "wzrd-runtime": "daytona-agent" },
        target: createClient.target,
        cpu: 2,
        memory: 4,
        autoStopInterval: 120,
        autoDeleteInterval: 0,
      },
      undefined,
      { timeout: 45_000 },
    );
    if (!response.data?.id) {
      throw new Error("daytona_create_invalid_response");
    }
    return { sandboxId: response.data.id };
  }

  if (!createClient.create) {
    throw new Error("daytona_create_unavailable");
  }
  const sandbox = await createClient.create(
    {
      image,
      envVars: sandboxEnv,
      resources: { cpu: 2, memory: 4 },
      autoStopInterval: 120,
    },
    { timeout: 45_000 },
  );
  return { sandboxId: sandbox.id };
}

export function buildSandboxEnv(): Record<string, string> {
  const env: Record<string, string> = {
    WZRD_AGENT_SESSION_ROLE: "agent",
    WZRD_AGENT_INPUT_DIR: DAYTONA_AGENT_DEFAULTS.inputDir,
    WZRD_AGENT_OUTPUT_DIR: DAYTONA_AGENT_DEFAULTS.outputDir,
  };
  copyOptionalEnv(env, DAYTONA_AGENT_ENV.openAiApiKey);
  copyOptionalEnv(env, DAYTONA_AGENT_ENV.falKey);
  copyOptionalEnv(env, DAYTONA_AGENT_ENV.falApiKey);
  copyOptionalEnv(env, DAYTONA_AGENT_ENV.gmiCloudApiKey);
  copyOptionalEnv(env, DAYTONA_AGENT_ENV.imaRouterApiKey);

  const gmiApiKey =
    getOptionalEnv(DAYTONA_AGENT_ENV.gmiApiKey) ||
    getOptionalEnv(DAYTONA_AGENT_ENV.gmiCloudApiKey);
  if (gmiApiKey) {
    env.GMI_API_KEY = gmiApiKey;
  }
  if (!env.FAL_API_KEY && env.FAL_KEY) {
    env.FAL_API_KEY = env.FAL_KEY;
  }
  return env;
}

function copyOptionalEnv(env: Record<string, string>, name: string): void {
  const value = getOptionalEnv(name);
  if (value) {
    env[name] = value;
  }
}

export async function getSandbox(session: DaytonaAgentSession): Promise<DaytonaSandbox> {
  if (!session.sandbox_id) {
    throw new Error("session_sandbox_not_ready");
  }
  return createDaytonaClient().get(session.sandbox_id);
}

export async function stopSandbox(session: DaytonaAgentSession): Promise<void> {
  const sandbox = await getSandbox(session);
  const daytona = createDaytonaClient() as unknown as {
    delete?: (sandbox: DaytonaSandbox, timeout?: number) => Promise<void>;
  };
  if (daytona.delete) {
    await daytona.delete(sandbox, 60);
    return;
  }
  const disposable = sandbox as unknown as {
    delete?: () => Promise<void>;
    destroy?: () => Promise<void>;
  };
  if (disposable.delete) {
    await disposable.delete();
    return;
  }
  if (disposable.destroy) {
    await disposable.destroy();
  }
}

export async function ensureSandboxDirs(session: DaytonaAgentSession): Promise<void> {
  const sandbox = await getSandbox(session);
  const command = `mkdir -p ${session.input_dir} ${session.output_dir}`;
  await (sandbox as unknown as DaytonaSandboxApis).process?.executeCommand?.(
    command,
    session.workspace_dir,
    undefined,
    60,
  );
}

export async function listSandboxFiles({
  session,
  path,
}: {
  session: DaytonaAgentSession;
  path: string;
}): Promise<AgentFileEntry[]> {
  const safePath = normalizeSandboxPath(path);
  const sandbox = await getSandbox(session);
  const files =
    (await (sandbox as unknown as DaytonaSandboxApis).fs?.listFiles?.(safePath).catch(() => [])) ?? [];
  return files.flatMap((file) => {
    try {
      const filename = normalizeFilename(file.name);
      return [
        {
          filename,
          path: joinSandboxPath(safePath, filename),
          bytes: Number.isFinite(Number(file.size)) ? Number(file.size) : 0,
          isDir: Boolean(file.isDir),
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function uploadSandboxFile({
  session,
  dir,
  filename,
  bytes,
}: {
  session: DaytonaAgentSession;
  dir: string;
  filename: string;
  bytes: Uint8Array;
}): Promise<AgentFileEntry> {
  const safeDir = normalizeSandboxPath(dir);
  const safeFilename = normalizeFilename(filename);
  const remotePath = joinSandboxPath(safeDir, safeFilename);
  const sandbox = await getSandbox(session);
  await (sandbox as unknown as DaytonaSandboxApis).fs?.createFolder?.(safeDir, "755").catch(() => {});
  await (sandbox as unknown as DaytonaSandboxApis).fs?.uploadFile?.(bytes, remotePath, 10 * 60);
  return {
    filename: safeFilename,
    path: remotePath,
    bytes: bytes.byteLength,
    isDir: false,
  };
}

export async function downloadSandboxFile({
  session,
  path,
}: {
  session: DaytonaAgentSession;
  path: string;
}): Promise<Uint8Array> {
  const safePath = normalizeSandboxPath(path);
  const sandbox = await getSandbox(session);
  const sandboxApis = sandbox as unknown as DaytonaSandboxApis;
  if (sandboxApis.fs?.apiClient?.downloadFiles) {
    return await downloadSandboxFileViaApiClient({ sandbox, path: safePath });
  }
  const result = await sandboxApis.fs?.downloadFile?.(safePath, 10 * 60);
  if (result instanceof Uint8Array) return result;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (typeof result === "string") return new TextEncoder().encode(result);
  throw new Error("sandbox_file_download_failed");
}

async function downloadSandboxFileViaApiClient({
  sandbox,
  path,
}: {
  sandbox: DaytonaSandbox;
  path: string;
}): Promise<Uint8Array> {
  const apiClient = (sandbox as unknown as DaytonaSandboxApis).fs?.apiClient;
  if (!apiClient?.downloadFiles) {
    throw new Error("daytona_download_api_unavailable");
  }
  const response = await apiClient.downloadFiles(
    { paths: [path] },
    { responseType: "arraybuffer", timeout: 600_000 },
  );
  return await decodeDaytonaDownloadResponse({
    data: response.data,
    headers: response.headers,
    path,
  });
}

export async function decodeDaytonaDownloadResponse({
  data,
  headers,
  path,
}: {
  data: unknown;
  headers?: DaytonaDownloadHeaders;
  path: string;
}): Promise<Uint8Array> {
  const bodyBytes = await normalizeDownloadResponseBytes(data);
  const contentType = getHeaderValue(headers, "content-type");
  if (!contentType.toLowerCase().startsWith("multipart/")) {
    return copyBytes(bodyBytes);
  }

  const boundary = extractMultipartBoundary(contentType);
  if (!boundary) {
    throw new Error("daytona_download_boundary_missing");
  }

  const parts = parseMultipartBody({ bodyBytes, boundary });
  const errorPart = parts.find((part) => part.name === "error" && part.filename === path);
  if (errorPart) {
    throw new Error(decodeUtf8(errorPart.data) || "daytona_download_failed");
  }
  const filePart =
    parts.find((part) => part.name === "file" && part.filename === path) ??
      parts.find((part) => part.name === "file");
  if (!filePart) {
    throw new Error("daytona_download_file_missing");
  }
  return copyBytes(filePart.data);
}

async function normalizeDownloadResponseBytes(data: unknown): Promise<Uint8Array> {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  if (data instanceof ReadableStream) {
    return new Uint8Array(await new Response(data).arrayBuffer());
  }
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  throw new Error("daytona_download_response_unsupported");
}

function getHeaderValue(headers: DaytonaDownloadHeaders | undefined, key: string): string {
  if (!headers) return "";
  const matchingKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  if (!matchingKey) return "";
  const value = headers[matchingKey];
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

function extractMultipartBoundary(contentType: string): string | null {
  const match = /boundary="?([^";]+)"?/i.exec(contentType);
  return match ? match[1] : null;
}

function parseMultipartBody({
  bodyBytes,
  boundary,
}: {
  bodyBytes: Uint8Array;
  boundary: string;
}): MultipartPart[] {
  const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
  const boundaryPositions = findByteSequencePositions({
    bytes: bodyBytes,
    sequence: boundaryBytes,
  });
  const parts: MultipartPart[] = [];
  for (let index = 0; index < boundaryPositions.length - 1; index += 1) {
    const part = parseMultipartPart({
      bodyBytes,
      start: boundaryPositions[index],
      end: boundaryPositions[index + 1],
      boundaryLength: boundaryBytes.length,
    });
    if (part) parts.push(part);
  }
  return parts;
}

function parseMultipartPart({
  bodyBytes,
  start,
  end,
  boundaryLength,
}: {
  bodyBytes: Uint8Array;
  start: number;
  end: number;
  boundaryLength: number;
}): MultipartPart | null {
  const headerStart = start + boundaryLength + MULTIPART_LINE_ENDING.length;
  if (headerStart >= end) return null;

  const separatorBytes = new TextEncoder().encode(MULTIPART_HEADER_SEPARATOR);
  const separator = findByteSequence({
    bytes: bodyBytes,
    sequence: separatorBytes,
    start: headerStart,
    end,
  });
  if (separator < 0) return null;

  const headersText = decodeUtf8(bodyBytes.subarray(headerStart, separator));
  const headers = parseMultipartHeaders(headersText);
  const disposition = headers["content-disposition"] || "";
  const dataStart = separator + separatorBytes.length;
  const dataEnd =
    end >= MULTIPART_LINE_ENDING.length &&
      decodeUtf8(bodyBytes.subarray(end - MULTIPART_LINE_ENDING.length, end)) === MULTIPART_LINE_ENDING
      ? end - MULTIPART_LINE_ENDING.length
      : end;

  return {
    name: getDispositionParam(disposition, "name"),
    filename: getDispositionParam(disposition, "filename"),
    headers,
    data: bodyBytes.subarray(dataStart, Math.max(dataStart, dataEnd)),
  };
}

function parseMultipartHeaders(headersText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of headersText.split(MULTIPART_LINE_ENDING)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function getDispositionParam(disposition: string, key: string): string | null {
  const match = new RegExp(`${key}\\*?=([^;]+)`, "i").exec(disposition);
  if (!match) return null;
  return match[1].replace(/^"|"$/g, "").trim();
}

function findByteSequencePositions({
  bytes,
  sequence,
}: {
  bytes: Uint8Array;
  sequence: Uint8Array;
}): number[] {
  const positions: number[] = [];
  let start = 0;
  while (start <= bytes.length - sequence.length) {
    const position = findByteSequence({
      bytes,
      sequence,
      start,
      end: bytes.length,
    });
    if (position < 0) break;
    positions.push(position);
    start = position + sequence.length;
  }
  return positions;
}

function findByteSequence({
  bytes,
  sequence,
  start,
  end,
}: {
  bytes: Uint8Array;
  sequence: Uint8Array;
  start: number;
  end: number;
}): number {
  for (let index = start; index <= end - sequence.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (bytes[index + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
