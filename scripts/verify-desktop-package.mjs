import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { listPackage } from "@electron/asar";
import { assertMacIcnsComplete } from "./desktop-icns.mjs";

const outputDirectory = join(process.cwd(), "release", "desktop");
const version = JSON.parse(
  readFileSync(join(process.cwd(), "apps", "desktop", "package.json"), "utf8"),
).version;

const walk = (directory) => {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) result.push(...walk(path));
    else result.push(path);
  }
  return result;
};

const files = walk(outputDirectory);
const matchingPrefix = (prefix) => files.filter((path) => basename(path).startsWith(prefix));
const requestedPlatform = process.env.EDGE_EVER_VERIFY_TARGET ?? process.platform;
const requestedArch = process.env.EDGE_EVER_DESKTOP_ARCH ?? process.arch;

const verifyMachOArch = (path, arch, label) => {
  const result = spawnSync("lipo", ["-archs", path], { encoding: "utf8" });
  const expectedArch = arch === "x64" ? "x86_64" : arch;
  assert.equal(result.status, 0, `${label} architecture inspection failed: ${result.stderr || result.stdout}`);
  assert.deepEqual(result.stdout.trim().split(/\s+/), [expectedArch], `${label} must contain only ${expectedArch}`);
};

for (const sidecarPath of files.filter((path) => /[\\/]resources[\\/]sidecar[\\/]edgeever-sidecar(?:\.exe)?$/i.test(path))) {
  const bundleRoot = sidecarPath.replace(/[\\/]resources[\\/]sidecar[\\/]edgeever-sidecar(?:\.exe)?$/i, "");
  assert.ok(existsSync(join(bundleRoot, "resources", "web", "index.html")), `Desktop bundle is missing the Web renderer: ${bundleRoot}`);
  assert.ok(existsSync(join(bundleRoot, "resources", "migrations")), `Desktop bundle is missing migrations: ${bundleRoot}`);
}

if (requestedPlatform === "darwin") {
  assert.ok(["arm64", "x64"].includes(requestedArch), `Unsupported macOS architecture: ${requestedArch}`);
  assert.ok(existsSync(join(outputDirectory, `EdgeEver-${version}-mac-${requestedArch}.dmg`)), `macOS package must contain the current ${requestedArch} DMG`);
  assert.ok(existsSync(join(outputDirectory, `EdgeEver-${version}-mac-${requestedArch}.dmg.blockmap`)), `macOS package must contain the current ${requestedArch} DMG blockmap`);
  assert.ok(existsSync(join(outputDirectory, `EdgeEver-${version}-mac-${requestedArch}.zip`)), `macOS package must contain the current ${requestedArch} update ZIP`);
  assert.ok(existsSync(join(outputDirectory, `EdgeEver-${version}-mac-${requestedArch}.zip.blockmap`)), `macOS package must contain the current ${requestedArch} ZIP blockmap`);
  const unpackedDirectory = requestedArch === "x64" ? "mac" : `mac-${requestedArch}`;
  const unpackedApp = join(outputDirectory, unpackedDirectory, "EdgeEver.app");
  assert.ok(existsSync(unpackedApp), "macOS package must contain the unpacked app bundle");
  const executable = join(unpackedApp, "Contents", "MacOS", "EdgeEver");
  const appResources = join(unpackedApp, "Contents", "Resources");
  const sidecar = join(appResources, "sidecar", "edgeever-sidecar");
  assert.ok(existsSync(sidecar), `macOS app bundle is missing the sidecar: ${sidecar}`);
  verifyMachOArch(executable, requestedArch, "Electron executable");
  verifyMachOArch(sidecar, requestedArch, "Rust sidecar");
  const asarPath = join(appResources, "app.asar");
  assert.ok(existsSync(asarPath), `macOS app bundle is missing app.asar: ${asarPath}`);
  const asarFiles = new Set(listPackage(asarPath));
  assert.ok(asarFiles.has("/src/preload/index.cjs"), "macOS app bundle must contain the sandbox-compatible CommonJS preload");
  assert.ok(!asarFiles.has("/src/preload/index.mjs"), "macOS app bundle must not contain the unsupported ESM preload");
  const appIconPath = join(appResources, "icon.icns");
  assert.ok(existsSync(appIconPath), `macOS app bundle is missing icon.icns: ${appIconPath}`);
  assertMacIcnsComplete(readFileSync(appIconPath), appIconPath);
  const infoPlist = readFileSync(join(unpackedApp, "Contents", "Info.plist"), "utf8");
  assert.match(infoPlist, /CFBundleIconFile/, "macOS Info.plist must declare CFBundleIconFile");
  // LaunchServices registers unpacked build products as additional document
  // handlers. The signed DMG/ZIP are the release artifacts, so discard the
  // disposable unpacked bundle once its contents have passed verification.
  rmSync(unpackedApp, { recursive: true, force: true });
} else if (requestedPlatform === "win32") {
  const installer = matchingPrefix(`EdgeEver-${version}-windows-`).some((path) => path.endsWith(".exe"));
  const unpacked = existsSync(join(outputDirectory, "win-arm64-unpacked", "EdgeEver.exe"));
  assert.ok(installer || unpacked, "Windows package must contain the current NSIS installer or an unpacked executable");
} else if (requestedPlatform === "linux") {
  assert.ok(matchingPrefix(`EdgeEver-${version}-linux-`).some((path) => path.endsWith(".AppImage")), "Linux package must contain the current AppImage");
  const unpacked = files.find((path) => path.endsWith("/resources/sidecar/edgeever-sidecar") && path.includes("linux-") && path.includes("-unpacked"));
  if (unpacked) {
    const root = unpacked.slice(0, unpacked.indexOf("/resources/sidecar/edgeever-sidecar"));
    assert.ok(existsSync(join(root, "resources", "web", "index.html")), "Linux app bundle is missing the Web renderer");
    assert.ok(existsSync(join(root, "resources", "migrations")), "Linux app bundle is missing migrations");
  }
} else {
  throw new Error(`Unsupported packaging platform: ${requestedPlatform}`);
}

console.log(JSON.stringify({ ok: true, platform: requestedPlatform, artifacts: files.filter((path) => /\.(dmg|exe|AppImage)$/.test(path)) }));
