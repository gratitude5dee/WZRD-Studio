import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function fetchCreditBalancePayload(options?: {
  repairUserId?: string;
}): Promise<Json | null> {
  const initial = await supabase.rpc("credits_get_balance");
  if (!initial.error) return initial.data;

  if (!options?.repairUserId) return null;

  const repair = await supabase.rpc("ensure_credit_account", {
    p_user_id: options.repairUserId,
    p_source: "client_fetch_repair",
  });
  if (repair.error) return null;

  const retry = await supabase.rpc("credits_get_balance");
  return retry.error ? null : retry.data;
}
