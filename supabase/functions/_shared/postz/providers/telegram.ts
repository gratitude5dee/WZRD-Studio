import { notImplementedProvider } from "./not-implemented.ts";

export default notImplementedProvider({
  identifier: "telegram",
  name: "Telegram",
  requiredEnvVars: ["POSTZ_TELEGRAM_CLIENT_ID", "POSTZ_TELEGRAM_CLIENT_SECRET"],
});
