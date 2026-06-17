export {};

declare global {
  interface Window {
    wzrd?: {
      editor?: {
        version: string;
        commands: {
          execute: (
            command: string,
            args?: unknown,
          ) => Promise<{ ok: boolean; result?: unknown; error?: string; code?: string }>;
        };
        debug?: {
          getCommandLog: () => Array<{
            id: string;
            ts: number;
            source: string;
            command: string;
            args: unknown;
            ok: boolean;
            code?: string;
            error?: string;
            durationMs: number;
          }>;
          clearCommandLog: () => void;
          getRateLimitState: () => { windowMs: number; maxCalls: number; currentCalls: number };
        };
      };
    };
  }
}
