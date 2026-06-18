import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "facebook",
  name: "Facebook",
  requiredEnvVars: ["POSTZ_FACEBOOK_CLIENT_ID", "POSTZ_FACEBOOK_CLIENT_SECRET"],
});
