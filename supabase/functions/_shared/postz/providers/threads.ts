import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "threads",
  name: "Threads",
  requiredEnvVars: ["POSTZ_THREADS_CLIENT_ID", "POSTZ_THREADS_CLIENT_SECRET"],
});
