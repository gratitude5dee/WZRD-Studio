import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "mastodon",
  name: "Mastodon",
  requiredEnvVars: ["POSTZ_MASTODON_CLIENT_ID", "POSTZ_MASTODON_CLIENT_SECRET"],
});
