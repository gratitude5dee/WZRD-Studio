import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "discord",
  name: "Discord",
  requiredEnvVars: ["POSTZ_DISCORD_CLIENT_ID", "POSTZ_DISCORD_CLIENT_SECRET"],
});
