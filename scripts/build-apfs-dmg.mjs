import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function fileExists(p) {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const projectRoot = process.cwd();
  const pkg = JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf-8"));

  const productName = pkg?.build?.productName || "WZRD Studio";
  const releaseDir = path.join(projectRoot, "release");

  // electron-builder --mac dir --arm64 outputs the .app here
  const srcFolder = path.join(releaseDir, "mac-arm64");

  // Ensure the expected .app exists
  const entries = await fs.readdir(srcFolder);
  const appName = entries.find((n) => n.endsWith(".app"));
  if (!appName) {
    throw new Error(`No .app found in ${srcFolder}. Did you run electron-builder with --mac dir --arm64 first?`);
  }

  // Create an /Applications symlink inside the src folder (temporarily) so the DMG looks like a standard installer.
  const applicationsLink = path.join(srcFolder, "Applications");
  const createdApplicationsLink = !(await fileExists(applicationsLink));
  if (createdApplicationsLink) {
    await fs.symlink("/Applications", applicationsLink);
  }

  const outDmg = path.join(releaseDir, "wzrdstudiofinal555-apfs.dmg");

  try {
    // Force APFS to avoid issues we observed with HFS+ DMGs on this machine.
    await execFileAsync("/usr/bin/hdiutil", [
      "create",
      "-ov",
      "-fs",
      "APFS",
      "-format",
      "UDZO",
      "-volname",
      productName,
      "-srcfolder",
      srcFolder,
      outDmg,
    ]);

    await execFileAsync("/usr/bin/hdiutil", ["verify", outDmg]);

    console.log(`APFS DMG created: ${outDmg}`);
  } finally {
    if (createdApplicationsLink) {
      // Clean up after ourselves
      await fs.unlink(applicationsLink);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
