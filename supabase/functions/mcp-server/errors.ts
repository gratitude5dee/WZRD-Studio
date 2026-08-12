/**
 * JSON-RPC error vocabulary for the WZRD MCP server.
 *
 * Codes are stable and part of the plugin contract: harnesses branch on them to
 * decide whether to re-authenticate, ask the user to widen a scope, back off, or
 * surface a top-up link.
 */
export const RPC_ERROR = {
  auth: -32001,
  scope: -32002,
  credits: -32003,
  rateLimited: -32004,
  notFound: -32005,
  validation: -32006,
  internal: -32000,
  methodNotFound: -32601,
} as const;

export class RpcError extends Error {
  readonly code: number;
  readonly data?: Record<string, unknown>;

  constructor(code: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export function authError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.auth, message, data);
}

export function scopeError(required: string, granted: string[]): RpcError {
  return new RpcError(
    RPC_ERROR.scope,
    `This tool requires the "${required}" scope. Mint or edit a token with "${required}" at /settings/agent-access (current scopes: ${
      granted.length ? granted.join(', ') : 'none'
    }).`,
    { requiredScope: required, grantedScopes: granted },
  );
}

export function creditsError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.credits, message, data);
}

export function rateLimitedError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.rateLimited, message, data);
}

export function notFoundError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.notFound, message, data);
}

export function validationError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.validation, message, data);
}

export function internalError(message: string, data?: Record<string, unknown>): RpcError {
  return new RpcError(RPC_ERROR.internal, message, data);
}
