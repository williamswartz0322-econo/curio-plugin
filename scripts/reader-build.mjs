// Shared by setup.mjs and check-setup.mjs: where the reader is built, and a
// hash of its sources that says whether that build is current. Node rather
// than shell so it runs the same on macOS, Linux, and Windows.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = path.join(ROOT, "app");

function listFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

export function readerHash() {
  const hash = crypto.createHash("sha256");
  const files = ["package-lock.json", "package.json", "next.config.ts", "tsconfig.json"]
    .map((f) => path.join(SOURCE, f))
    .concat(listFiles(path.join(SOURCE, "src")).sort());
  for (const file of files) {
    hash.update(path.relative(SOURCE, file).split(path.sep).join("/"));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex").slice(0, 16);
}

export function isCurrent(appDir) {
  const stamp = path.join(appDir, ".curio-build");
  return (
    fs.existsSync(stamp) &&
    fs.existsSync(path.join(appDir, ".next", "BUILD_ID")) &&
    fs.readFileSync(stamp, "utf-8").trim() === readerHash()
  );
}
