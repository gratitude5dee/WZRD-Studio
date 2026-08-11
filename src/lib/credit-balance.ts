import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export async function fetchCreditBalancePayload(options?: {
  repairUserId?: string;
}): Promise<Json> {
  const initial = await supabase.rpc("credits_get_balance");
  if (!initial.error) return initial.data;

  if (!options?.repairUserId) throw initial.error;

  const repair = await supabase.rpc("ensure_credit_account", {
    p_user_id: options.repairUserId,
    p_source: "client_fetch_repair",
  });
  if (repair.error) throw repair.error;

  const retry = await supabase.rpc("credits_get_balance");
  if (retry.error) throw retry.error;
  return retry.data;
}
