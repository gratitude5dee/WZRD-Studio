import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "linkedin-page",
  name: "LinkedIn Page",
  requiredEnvVars: ["POSTZ_LINKEDIN_PAGE_CLIENT_ID", "POSTZ_LINKEDIN_PAGE_CLIENT_SECRET"],
});
