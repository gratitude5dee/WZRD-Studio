/**
 * Tool contract shared by every WZRD MCP tool.
 *
 * The cross-cutting behaviours agents rely on (scopes, dry runs, idempotent
 * replays, async jobs, progress) are declared here and implemented once in the
 * dispatcher, so a tool module only describes its own schema and effect.
 */
import type { McpIdentity, Scope } from '../auth.ts';
import type { ServiceClient } from '../client.ts';

export interface InvokeResult {
  status: number;
  data: unknown;
}

export interface ToolContext {
  identity: McpIdentity;
  /** Service-role client. Every query must be scoped by `identity.userId`. */
  svc: ServiceClient;
  /** POST to another Edge Function as the PAT's user (internal actor headers). */
  invoke(fn: string, body: unknown): Promise<InvokeResult>;
  /** POST to an SSE Edge Function, streaming each `data:` payload to `onEvent`. */
  invokeSse(
    fn: string,
    body: unknown,
    onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  ): Promise<{ status: number; events: Array<Record<string, unknown>> }>;
  /** Publish progress for the current job (no-op for synchronous calls). */
  progress(update: Record<string, unknown>): Promise<void>;
  /** Job backing this call, when the tool runs async. */
  jobId?: string;
  /** Wall-clock budget: tools must return before this instant. */
  deadlineAt: number;
}

export interface CostBreakdownEntry {
  step: string;
  credits: number;
  note?: string;
}

export interface CostEstimate {
  credits: number;
  breakdown: CostBreakdownEntry[];
}

export interface ToolDefinition {
  name: string;
  /** One-line when-to-use, plus credit cost for spending tools. */
  description: string;
  scope: Scope;
  inputSchema: Record<string, unknown>;
  /** Spending tools estimate cost for `dryRun` and pre-flight cap checks. */
  estimate?: (ctx: ToolContext, args: Record<string, unknown>) => Promise<CostEstimate>;
  /** Run as a background job and answer immediately with `{ jobId, status }`. */
  async?: boolean;
  /**
   * Set on any tool that writes or deletes persisted data. Drives the published
   * `readOnlyHint`, which harnesses use to decide whether a call needs the
   * user's confirmation, so it cannot be inferred from the credit scope: a free
   * tool can still delete a timeline clip.
   */
  mutates?: boolean;
  handler: (ctx: ToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

export type { McpIdentity, Scope };

/** Argument shared by every credit-spending tool. */
export const IDEMPOTENCY_PROPERTY = {
  idempotencyKey: {
    type: 'string',
    description:
      'Caller-chosen key. Replaying the same key returns the original result instead of charging again.',
  },
} as const;

export const DRY_RUN_PROPERTY = {
  dryRun: {
    type: 'boolean',
    description: 'Return { credits, breakdown } without generating anything or spending credits.',
  },
} as const;

/** Compose a schema for a credit-spending tool. */
export function spendingSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: { ...properties, ...IDEMPOTENCY_PROPERTY, ...DRY_RUN_PROPERTY },
    required,
  };
}

/** Compose a schema for a free tool. */
export function readSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, properties, required };
}

export function requireString(args: Record<string, unknown>, key: string): string {
  return String(args[key] ?? '');
}

export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Await `ms`, but never past the request deadline. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
