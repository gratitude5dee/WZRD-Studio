/**
 * Service-role client type used across the MCP server.
 *
 * The generated `Database` types live in the frontend and are not importable
 * from Deno, so the client is typed structurally as an untyped Supabase client
 * rather than as `any`: query builders stay chainable and typo'd methods still
 * fail to compile.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type ServiceClient = SupabaseClient;
