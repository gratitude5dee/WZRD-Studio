import { supabase } from "@/integrations/supabase/client";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import {
  buildLocalSourcifyPlan,
  normalizeSourcifyResult,
  type SourcifyActorKey,
  type SourcifyPlan,
  type SourcifyResult,
  type SourcifyRunResponse,
  type SourcifySettings,
} from "./sourcify-model";

type SourcifyInvokeBody =
  | {
      action: "plan";
      topic: string;
      settings: Partial<SourcifySettings>;
    }
  | {
      action: "run";
      topic: string;
      actorKey: SourcifyActorKey;
      input: Record<string, unknown>;
      settings: Partial<SourcifySettings>;
    }
  | {
      action: "results";
      datasetId: string;
      actorKey?: SourcifyActorKey;
    }
  | {
      action: "finalize";
      projectId?: string;
      assetCategory: "upload" | "finalized";
      results: SourcifyResult[];
    };

async function invokeSourcify<T>(body: SourcifyInvokeBody): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke("sourcify-apify", {
    body,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (error) {
    // Supabase Functions errors can include the underlying Response; surface it to make
    // debugging (auth, secrets, upstream APIs) much easier than the default generic message.
    //
    // NOTE: In Vite/Electron bundling, `instanceof FunctionsHttpError` can fail if multiple
    // copies of the class exist in the bundle graph, so we also fall back to `error.name`.
    const errAny = error as any;
    const errName: string | undefined = errAny?.name ?? errAny?.constructor?.name;
    const context = errAny?.context as any;

    const looksLikeResponse =
      context &&
      typeof context.status === "number" &&
      typeof context.statusText === "string" &&
      typeof context.headers?.get === "function" &&
      typeof context.clone === "function";

    const response: Response | undefined = looksLikeResponse ? (context as Response) : undefined;
    const statusLine = response ? `${response.status} ${response.statusText}`.trim() : "unknown";

    const payload = await (async () => {
      if (!response) return "";
      try {
        const contentType = response.headers.get("content-type") ?? "";
        const safeResponse = response.clone();
        if (contentType.includes("application/json")) {
          return JSON.stringify(await safeResponse.json());
        }
        return await safeResponse.text();
      } catch {
        return "";
      }
    })();

    if (error instanceof FunctionsHttpError || errName === "FunctionsHttpError") {
      throw new Error(
        payload
          ? `Sourcify Edge Function error (${statusLine}): ${payload}`
          : `Sourcify Edge Function error (${statusLine}).`,
      );
    }

    if (error instanceof FunctionsRelayError || errName === "FunctionsRelayError") {
      throw new Error(
        payload
          ? `Sourcify relay error (${statusLine}): ${payload}`
          : `Sourcify relay error (${statusLine}).`,
      );
    }

    if (error instanceof FunctionsFetchError || errName === "FunctionsFetchError") {
      throw new Error(`Sourcify network error: ${errAny?.message ?? String(error)}`);
    }

    // Last resort: always wrap into a normal Error so the UI shows something useful.
    throw new Error(errAny?.message ?? String(error));
  }

  if (!data) {
    throw new Error("Sourcify returned an empty response.");
  }

  return data as T;
}

type YoutubeDuration = "all" | "s" | "l";

function normalizeYoutubeDuration(value: unknown): YoutubeDuration | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "all") return "all";
  if (normalized === "s" || normalized === "short" || normalized === "shorts" || normalized === "small") return "s";
  if (normalized === "l" || normalized === "long") return "l";
  return undefined;
}

function normalizeSourcifyActorInput(
  actorKey: SourcifyActorKey,
  actorInput: Record<string, unknown>,
): Record<string, unknown> {
  if (actorKey !== "youtube-fast" && actorKey !== "youtube-shorts") return actorInput;
  if (!("duration" in actorInput)) return actorInput;
  const duration = normalizeYoutubeDuration((actorInput as any).duration);
  if (!duration) {
    throw new Error(`Invalid YouTube duration: ${JSON.stringify((actorInput as any).duration)}. Allowed values: "all", "s", "l".`);
  }
  return { ...actorInput, duration };
}


export async function planSourcifyTopic(
  topic: string,
  settings: Partial<SourcifySettings>,
): Promise<SourcifyPlan> {
  try {
    return await invokeSourcify<SourcifyPlan>({ action: "plan", topic, settings });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Falling back to local Sourcify plan:", error);
    }
    return buildLocalSourcifyPlan(topic, settings);
  }
}

export async function runSourcifyActor(input: {
  topic: string;
  actorKey: SourcifyActorKey;
  actorInput: Record<string, unknown>;
  settings: Partial<SourcifySettings>;
}): Promise<SourcifyRunResponse> {
  const normalizedActorInput = normalizeSourcifyActorInput(input.actorKey, input.actorInput);

  const response = await invokeSourcify<Partial<SourcifyRunResponse> & { items?: unknown[] }>({
    action: "run",
    topic: input.topic,
    actorKey: input.actorKey,
    input: normalizedActorInput,
    settings: input.settings,
  });

  const results =
    response.results ??
    (response.items ?? []).map((item, index) => normalizeSourcifyResult(item, input.actorKey, index));

  return {
    runId: response.runId,
    datasetId: response.datasetId,
    status: response.status,
    usageTotalUsd: response.usageTotalUsd,
    results,
  };
}

export async function fetchSourcifyResults(input: {
  datasetId: string;
  actorKey?: SourcifyActorKey;
}): Promise<SourcifyResult[]> {
  const response = await invokeSourcify<{ results?: SourcifyResult[]; items?: unknown[] }>({
    action: "results",
    datasetId: input.datasetId,
    actorKey: input.actorKey,
  });
  return (
    response.results ??
    (response.items ?? []).map((item, index) => normalizeSourcifyResult(item, input.actorKey, index))
  );
}

export async function finalizeSourcifyResults(input: {
  projectId?: string;
  assetCategory: "upload" | "finalized";
  results: SourcifyResult[];
}) {
  return invokeSourcify<{
    success: boolean;
    assets: Array<{ resultId: string; assetId: string; url: string }>;
    skipped: Array<{ resultId: string; reason: string }>;
  }>({
    action: "finalize",
    projectId: input.projectId,
    assetCategory: input.assetCategory,
    results: input.results,
  });
}

export function downloadSourcifyResults(results: SourcifyResult[]) {
  for (const result of results) {
    const url = result.mediaUrl ?? result.sourceUrl;
    if (!url) continue;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.download = `${result.platform}-${result.title}`.replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }
}
