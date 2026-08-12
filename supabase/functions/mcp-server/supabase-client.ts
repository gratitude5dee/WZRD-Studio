/**
 * Minimal structural type for the service-role Supabase client used by the MCP
 * server.
 *
 * The generated client type is deliberately not used here: its deeply generic
 * builders are incompatible with the hand-written structural interfaces the shared
 * helpers in `_shared/` accept (`credits.ts` expects `rpc()` to return a plain
 * promise), and typing against them makes `deno check` recurse. This interface
 * covers exactly the surface the MCP server calls, so a typo in a builder chain is
 * still a type error, and the single cast lives in `index.ts` where the client is
 * created.
 */

export interface PostgrestError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export interface PostgrestResponse<T> {
  data: T;
  error: PostgrestError | null;
}

type Row = Record<string, unknown>;

export interface SelectBuilder<T> extends PromiseLike<PostgrestResponse<T[]>> {
  eq(column: string, value: unknown): SelectBuilder<T>;
  in(column: string, values: readonly unknown[]): SelectBuilder<T>;
  is(column: string, value: unknown): SelectBuilder<T>;
  or(filter: string): SelectBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): SelectBuilder<T>;
  limit(count: number): SelectBuilder<T>;
  maybeSingle<R = T>(): PromiseLike<PostgrestResponse<R | null>>;
  single<R = T>(): PromiseLike<PostgrestResponse<R | null>>;
}

export interface MutationBuilder<T> extends PromiseLike<PostgrestResponse<T[] | null>> {
  eq(column: string, value: unknown): MutationBuilder<T>;
  in(column: string, values: readonly unknown[]): MutationBuilder<T>;
  is(column: string, value: unknown): MutationBuilder<T>;
  select(columns?: string): SelectBuilder<T>;
}

export interface TableQuery<T extends Row = Row> {
  select(columns?: string): SelectBuilder<T>;
  insert(values: Row | Row[]): MutationBuilder<T>;
  update(values: Row): MutationBuilder<T>;
  upsert(values: Row | Row[], options?: { onConflict?: string }): MutationBuilder<T>;
  delete(): MutationBuilder<T>;
}

export interface McpSupabaseClient {
  from<T extends Row = Row>(table: string): TableQuery<T>;
  rpc(
    functionName: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: unknown; error: PostgrestError | null }>;
}
