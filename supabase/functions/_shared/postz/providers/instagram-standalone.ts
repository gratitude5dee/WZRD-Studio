import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "instagram-standalone",
  name: "Instagram Standalone",
  requiredEnvVars: ["POSTZ_INSTAGRAM_STANDALONE_CLIENT_ID", "POSTZ_INSTAGRAM_STANDALONE_CLIENT_SECRET"],
});
