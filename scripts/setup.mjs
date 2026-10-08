#!/usr/bin/env node
// Build the Curio reader into the plugin's data directory. The plugin's own
// directory is replaced on every update, so the reader (with its node_modules
// and production build) lives in <data>/app and is rebuilt only when its
// sources change.
// Usage: node setup.mjs <plugin data dir>
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { SOURCE, isCurrent, readerHash } from "./reader-build.mjs";

const data = process.argv[2];
if (!data) {
  console.error("usage: node setup.mjs <plugin data dir>");
  process.exit(2);
}
const app = path.join(data, "app");

if (isCurrent(app)) {
  console.log(`reader: up to date (${app})`);
  process.exit(0);
}

console.log(`reader: building into ${app} ...`);
fs.mkdirSync(app, { recursive: true });
// Replace the sources but keep node_modules, so npm ci can reuse its cache.
for (const entry of fs.readdirSync(app)) {
  if (entry !== "node_modules") fs.rmSync(path.join(app, entry), { recursive: true, force: true });
}
const skip = new Set(["node_modules", ".next"]);
fs.cpSync(SOURCE, app, {
  recursive: true,
  filter: (src) => {
    const name = path.basename(src);
    return !skip.has(name) && !name.startsWith(".env");
  },
});

// npm is npm.cmd on Windows, which only runs through a shell.
const shell = process.platform === "win32";
const run = (cmd, args, log) => {
  const result = spawnSync(cmd, args, {
    cwd: app,
    shell,
    encoding: "utf-8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (log) fs.writeFileSync(path.join(app, log), output);
  if (result.status !== 0) {
    console.error(output.split("\n").slice(-40).join("\n"));
    console.error(`reader: ${cmd} ${args.join(" ")} failed${log ? ` (full log: ${path.join(app, log)})` : ""}`);
    process.exit(1);
  }
};
run("npm", ["ci", "--no-audit", "--no-fund", "--loglevel=error"]);
run("npx", ["--no-install", "next", "build"], ".build.log");

fs.writeFileSync(path.join(app, ".curio-build"), readerHash());
console.log("reader: built");
