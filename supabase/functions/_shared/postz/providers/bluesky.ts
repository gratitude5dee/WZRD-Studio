import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "bluesky",
  name: "Bluesky",
  requiredEnvVars: ["POSTZ_BLUESKY_CLIENT_ID", "POSTZ_BLUESKY_CLIENT_SECRET"],
});
