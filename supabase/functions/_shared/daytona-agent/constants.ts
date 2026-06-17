export const DAYTONA_AGENT_ENV = {
  apiKey: 'DAYTONA_API_KEY',
  apiUrl: 'DAYTONA_API_URL',
  image: 'DAYTONA_AGENT_IMAGE',
  relaySecret: 'DAYTONA_RELAY_JWT_SECRET',
  relayUrl: 'DAYTONA_RELAY_URL',
  workspaceDir: 'DAYTONA_AGENT_WORKSPACE_DIR',
  openAiApiKey: 'OPENAI_API_KEY',
  falKey: 'FAL_KEY',
  falApiKey: 'FAL_API_KEY',
  gmiApiKey: 'GMI_API_KEY',
  gmiCloudApiKey: 'GMI_CLOUD_API_KEY',
  imaRouterApiKey: 'IMAROUTER_API_KEY',
} as const;

export const DAYTONA_AGENT_DEFAULTS = {
  inputDir: '/tmp/wzrd-input',
  outputDir: '/tmp/wzrd-output',
  workspaceDir: '/workspace/wzrd-studio-desktop',
  tokenIssuer: 'wzrd-studio-desktop',
  tokenAudience: 'wzrd-studio-daytona-agent-relay',
  tokenTtlSeconds: 5 * 60,
  sessionTtlMs: 2 * 60 * 60 * 1000,
  uploadLimitBytes: 25 * 1024 * 1024,
  listLimit: 100,
} as const;

export const DAYTONA_AGENT_STATUS = ['creating', 'ready', 'active', 'stopped', 'failed'] as const;

export const DAYTONA_AGENT_EVENTS = [
  'session_created',
  'sandbox_create_started',
  'sandbox_ready',
  'sandbox_failed',
  'relay_token_issued',
  'session_stopped',
  'file_uploaded',
  'file_listed',
  'file_downloaded',
] as const;

export function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getOptionalEnv(name: string): string {
  return Deno.env.get(name)?.trim() ?? '';
}
