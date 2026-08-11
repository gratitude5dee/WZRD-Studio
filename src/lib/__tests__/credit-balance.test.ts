import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

import { fetchCreditBalancePayload } from "../credit-balance";

describe("fetchCreditBalancePayload", () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it("returns the balance payload without writing when the read succeeds", async () => {
    const payload = { wallet: { available_total: 12 } };
    mockRpc.mockResolvedValue({ data: payload, error: null });

    await expect(fetchCreditBalancePayload()).resolves.toEqual(payload);
    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("credits_get_balance");
  });

  it("preserves the original read error when repair is not requested", async () => {
    const error = new Error("balance read failed");
    mockRpc.mockResolvedValue({ data: null, error });

    await expect(fetchCreditBalancePayload()).rejects.toBe(error);
    expect(mockRpc).toHaveBeenCalledOnce();
  });

  it("repairs once and retries the balance read", async () => {
    const payload = { wallet: { available_total: 12 } };
    mockRpc
      .mockResolvedValueOnce({ data: null, error: new Error("missing account") })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: payload, error: null });

    await expect(
      fetchCreditBalancePayload({ repairUserId: "user-1" })
    ).resolves.toEqual(payload);
    expect(mockRpc.mock.calls).toEqual([
      ["credits_get_balance"],
      [
        "ensure_credit_account",
        { p_user_id: "user-1", p_source: "client_fetch_repair" },
      ],
      ["credits_get_balance"],
    ]);
  });

  it("preserves a repair error instead of swallowing it", async () => {
    const repairError = new Error("repair failed");
    mockRpc
      .mockResolvedValueOnce({ data: null, error: new Error("missing account") })
      .mockResolvedValueOnce({ data: null, error: repairError });

    await expect(
      fetchCreditBalancePayload({ repairUserId: "user-1" })
    ).rejects.toBe(repairError);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("preserves a retry error after a successful repair", async () => {
    const retryError = new Error("retry failed");
    mockRpc
      .mockResolvedValueOnce({ data: null, error: new Error("missing account") })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: retryError });

    await expect(
      fetchCreditBalancePayload({ repairUserId: "user-1" })
    ).rejects.toBe(retryError);
  });
});
