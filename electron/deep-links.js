import { getAppUrl } from "./protocol.js";

const THIRDWEB_AUTH_CALLBACK_PARAMS = new Set(["authResult", "authCookie", "walletId", "authProvider"]);
const THIRDWEB_AUTH_ERROR_PARAMS = new Set(["error", "error_description"]);

const POSTZ_CONNECTED_ALLOWED_PARAMS = new Set(["provider", "channel", "status", "state_id"]);

export function normalizeDeepLinkPath(pathname = "") {
  return pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function createDeepLink(pathname) {
  return `wzrd://${normalizeDeepLinkPath(pathname)}`;
}

function sanitizeNextPath(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    decoded = candidate;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//")) {
    return null;
  }

  return decoded;
}

function buildUrlForLog(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "invalid-url";
  }

  const params = [];
  for (const key of url.searchParams.keys()) {
    params.push(`${key}=${THIRDWEB_AUTH_CALLBACK_PARAMS.has(key) ? "[redacted]" : "[present]"}`);
  }

  return `${url.protocol}//${url.host}${url.pathname}${params.length ? `?${params.join("&")}` : ""}${url.hash}`;
}

function createDiagnostics(rawUrl, appUrl, url, droppedParamNames = []) {
  return {
    droppedParamNames,
    paramNames: Array.from(url.searchParams.keys()),
    rawRoute: normalizeDeepLinkPath(`${url.hostname}${url.pathname}`),
    rawUrl: buildUrlForLog(rawUrl),
    resolvedRoute: buildUrlForLog(appUrl),
  };
}

function sanitizeParam(candidate, { pattern, maxLen = 128 } = {}) {
  if (!candidate || typeof candidate !== "string") {
    return null;
  }
  if (candidate.length > maxLen) {
    return null;
  }
  if (pattern && !pattern.test(candidate)) {
    return null;
  }
  return candidate;
}

function resolveThirdwebAuthDeepLink(rawUrl, url) {
  const nextParams = new URLSearchParams();
  const droppedParamNames = [];

  for (const [key, value] of url.searchParams.entries()) {
    if (THIRDWEB_AUTH_CALLBACK_PARAMS.has(key) || THIRDWEB_AUTH_ERROR_PARAMS.has(key)) {
      nextParams.append(key, value);
      continue;
    }

    if (key === "next") {
      const sanitizedNext = sanitizeNextPath(value);
      if (sanitizedNext) {
        nextParams.append(key, sanitizedNext);
      } else {
        droppedParamNames.push(key);
      }
      continue;
    }

    droppedParamNames.push(key);
  }

  const hasNextParams = Array.from(nextParams.keys()).length > 0;
  const loginPath = `/login${hasNextParams ? `?${nextParams.toString()}` : ""}${url.hash}`;
  const appUrl = getAppUrl(loginPath);
  return {
    appUrl,
    diagnostics: createDiagnostics(rawUrl, appUrl, url, droppedParamNames),
  };
}

export function resolveDeepLinkToAppUrlWithDiagnostics(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    const appUrl = getAppUrl("/");
    return {
      appUrl,
      diagnostics: {
        droppedParamNames: [],
        paramNames: [],
        rawRoute: "invalid-url",
        rawUrl: "invalid-url",
        resolvedRoute: buildUrlForLog(appUrl),
      },
    };
  }

  if (url.protocol !== "wzrd:") {
    const appUrl = getAppUrl("/");
    return {
      appUrl,
      diagnostics: createDiagnostics(rawUrl, appUrl, url),
    };
  }

  const route = normalizeDeepLinkPath(`${url.hostname}${url.pathname}`);
  if (route === "auth/thirdweb") {
    return resolveThirdwebAuthDeepLink(rawUrl, url);
  }

  if (route === "billing/success") {
    const appUrl = getAppUrl("/settings/billing?checkout=success");
    return {
      appUrl,
      diagnostics: createDiagnostics(rawUrl, appUrl, url),
    };
  }

  if (route === "billing/cancel") {
    const appUrl = getAppUrl("/settings/billing?checkout=cancel");
    return {
      appUrl,
      diagnostics: createDiagnostics(rawUrl, appUrl, url),
    };
  }


  if (route === "postz/connected") {
    const nextParams = new URLSearchParams();
    const droppedParamNames = [];

    nextParams.set("connected", "1");

    for (const [key, value] of url.searchParams.entries()) {
      if (!POSTZ_CONNECTED_ALLOWED_PARAMS.has(key)) {
        droppedParamNames.push(key);
        continue;
      }

      if (key === "provider") {
        const sanitized = sanitizeParam(value, { pattern: /^[a-z0-9-]+$/i, maxLen: 64 });
        if (sanitized) nextParams.set(key, sanitized);
        else droppedParamNames.push(key);
        continue;
      }

      if (key === "channel") {
        const sanitized = sanitizeParam(value, { pattern: /^[a-z0-9-]+$/i, maxLen: 64 });
        if (sanitized) nextParams.set(key, sanitized);
        else droppedParamNames.push(key);
        continue;
      }

      if (key === "state_id") {
        const sanitized = sanitizeParam(value, {
          pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
          maxLen: 36,
        });
        if (sanitized) nextParams.set(key, sanitized.toLowerCase());
        else droppedParamNames.push(key);
        continue;
      }

      if (key === "status") {
        const sanitized = sanitizeParam(value, { pattern: /^(success|error|needs_target)$/i, maxLen: 16 });
        if (sanitized) nextParams.set(key, sanitized.toLowerCase());
        else droppedParamNames.push(key);
        continue;
      }
    }

    const appUrl = getAppUrl(`/postz?${nextParams.toString()}`);
    return {
      appUrl,
      diagnostics: createDiagnostics(rawUrl, appUrl, url, droppedParamNames),
    };
  }
  const appUrl = getAppUrl("/");
  return {
    appUrl,
    diagnostics: createDiagnostics(rawUrl, appUrl, url),
  };
}

export function resolveDeepLinkToAppUrl(rawUrl) {
  return resolveDeepLinkToAppUrlWithDiagnostics(rawUrl).appUrl;
}
