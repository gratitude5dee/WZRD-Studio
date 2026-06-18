import type {
  AuthTokenDetails,
  OAuthTarget,
  PostResponse,
  PostzProvider,
  ProviderCapabilities,
} from "./types.ts";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function ensureScopes(required: string[], returned: unknown) {
  const scopeString = typeof returned === "string" ? returned : "";
  const scopes = new Set(scopeString.split(/[\s,]+/).filter(Boolean));
  for (const scope of required) {
    if (!scopes.has(scope)) {
      throw new Error(`YouTube scope missing: ${scope}`);
    }
  }
}

const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtubepartner",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const CAPABILITIES: ProviderCapabilities = {
  text: { maxLength: 5000, supportsThreads: false },
  media: {
    images: false,
    video: true,
    maxImages: 0,
    maxVideoSeconds: 0,
    maxFileBytes: 0,
    required: true,
  },
  firstComment: false,
  title: true,
};

async function fetchYouTubeChannels(accessToken: string, ids?: string[]) {
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  if (ids && ids.length > 0) {
    url.searchParams.set("id", ids.join(","));
  } else {
    url.searchParams.set("mine", "true");
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`YouTube channels request failed: ${JSON.stringify(json)}`);
  }

  return (json?.items ?? []) as any[];
}

const youtubeProvider: PostzProvider = {
  identifier: "youtube",
  name: "YouTube",
  capabilities: CAPABILITIES,
  requiredEnvVars: ["POSTZ_YOUTUBE_CLIENT_ID", "POSTZ_YOUTUBE_CLIENT_SECRET"],

  async generateAuthUrl(input: { state: string; codeVerifier: string; redirect: string }) {
    const clientId = requiredEnv("POSTZ_YOUTUBE_CLIENT_ID");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: input.redirect,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      state: input.state,
      scope: SCOPES.join(" "),
    });

    return {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      codeVerifier: input.codeVerifier,
      state: input.state,
    };
  },

  async authenticate(input: { code: string; codeVerifier: string; redirect: string }): Promise<AuthTokenDetails> {
    const clientId = requiredEnv("POSTZ_YOUTUBE_CLIENT_ID");
    const clientSecret = requiredEnv("POSTZ_YOUTUBE_CLIENT_SECRET");

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirect,
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`YouTube token exchange failed: ${JSON.stringify(tokenJson)}`);
    }

    const accessToken = String(tokenJson.access_token ?? "");
    const refreshToken = String(tokenJson.refresh_token ?? "");
    const expiresIn = Number(tokenJson.expires_in ?? 0);

    ensureScopes(SCOPES, tokenJson.scope);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userJson = await userRes.json();
    if (!userRes.ok) {
      throw new Error(`YouTube userinfo failed: ${JSON.stringify(userJson)}`);
    }

    return {
      id: String(userJson.id ?? ""),
      name: String(userJson.name ?? ""),
      username: String(userJson.email ?? ""),
      picture: String(userJson.picture ?? ""),
      accessToken,
      refreshToken,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    };
  },

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    const clientId = requiredEnv("POSTZ_YOUTUBE_CLIENT_ID");
    const clientSecret = requiredEnv("POSTZ_YOUTUBE_CLIENT_SECRET");

    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(`YouTube refresh failed: ${JSON.stringify(tokenJson)}`);
    }

    const accessToken = String(tokenJson.access_token ?? "");
    const expiresIn = Number(tokenJson.expires_in ?? 0);

    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userJson = await userRes.json();
    if (!userRes.ok) {
      throw new Error(`YouTube userinfo failed: ${JSON.stringify(userJson)}`);
    }

    return {
      id: String(userJson.id ?? ""),
      name: String(userJson.name ?? ""),
      username: String(userJson.email ?? ""),
      picture: String(userJson.picture ?? ""),
      accessToken,
      refreshToken,
      expiresIn: Number.isFinite(expiresIn) ? expiresIn : undefined,
    };
  },

  async post(): Promise<PostResponse[]> {
    throw new Error("YouTube publishing not implemented yet");
  },

  async listTargets(accessToken: string): Promise<OAuthTarget[]> {
    const channels = await fetchYouTubeChannels(accessToken);
    return channels.map((channel) => ({
      id: String(channel.id ?? ""),
      name: String(channel?.snippet?.title ?? "Unnamed Channel"),
      meta: {
        picture: channel?.snippet?.thumbnails?.default?.url ?? "",
        username: channel?.snippet?.customUrl ?? "",
      },
    })).filter((row) => Boolean(row.id));
  },

  async finalizeTarget(accessToken: string, target: OAuthTarget) {
    if (target.meta?.picture && target.meta?.username) {
      return {
        id: target.id,
        name: target.name,
        username: String(target.meta.username ?? ""),
        picture: String(target.meta.picture ?? ""),
        accessToken,
      };
    }

    const channels = await fetchYouTubeChannels(accessToken, [target.id]);
    const channel = channels[0];
    return {
      id: String(channel?.id ?? target.id),
      name: String(channel?.snippet?.title ?? target.name),
      username: String(channel?.snippet?.customUrl ?? ""),
      picture: String(channel?.snippet?.thumbnails?.default?.url ?? ""),
      accessToken,
    };
  },
};

export default youtubeProvider;
