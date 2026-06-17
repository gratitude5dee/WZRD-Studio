import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function findAppBundle(appOutDir) {
  const entries = await fs.promises.readdir(appOutDir);
  const app = entries.find((name) => name.endsWith(".app"));
  return app ? path.join(appOutDir, app) : null;
}

export default async function afterPack(context) {
  // Only relevant for mac builds.
  if (context.electronPlatformName !== "darwin") return;

  // If the user is doing proper signing (Developer ID), don't touch the signature.
  // electron-builder uses CSC_* env vars for signing.
  if (process.env.CSC_LINK || process.env.CSC_NAME || process.env.CSC_KEY_PASSWORD) return;

  const appPath = await findAppBundle(context.appOutDir);
  if (!appPath) {
    console.warn(`[afterPack] No .app bundle found in ${context.appOutDir}`);
    return;
  }

  // electron-builder can leave an invalid/partial ad-hoc signature when signing is disabled.
  // That causes Gatekeeper to show "is damaged". Re-sign ad-hoc so the bundle is internally consistent.
  console.log(`[afterPack] Ad-hoc signing app bundle: ${appPath}`);

  await execFileAsync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", appPath], {
    env: process.env,
  });
}
