import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "linkedin",
  name: "LinkedIn",
  requiredEnvVars: ["POSTZ_LINKEDIN_CLIENT_ID", "POSTZ_LINKEDIN_CLIENT_SECRET"],
});
