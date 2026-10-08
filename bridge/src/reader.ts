// Launch the Next.js reader as a child of this MCP server, so it lives and
// dies with the Claude Code session that answers its requests.
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import net from "net";
import path from "path";

export interface Reader {
  url: string;
  stop: () => void;
}

interface ReaderDir {
  dir: string;
  mode: "start" | "dev";
}

/**
 * Where the built reader lives: /curio:setup builds it into the plugin's data
 * directory. CURIO_READER_DIR (with CURIO_READER_MODE=dev) points at a source
 * checkout instead, for developing Curio itself.
 */
export function readerDir(): ReaderDir | { error: string } {
  if (process.env.CURIO_READER_DIR) {
    const mode = process.env.CURIO_READER_MODE === "dev" ? "dev" : "start";
    return { dir: path.resolve(process.env.CURIO_READER_DIR), mode };
  }
  const data = process.env.CLAUDE_PLUGIN_DATA;
  const dir = data ? path.join(data, "app") : "";
  if (!dir || !fs.existsSync(path.join(dir, ".next", "BUILD_ID"))) {
    return { error: "The reader isn't built yet. Run /curio:setup, then try again." };
  }
  return { dir, mode: "start" };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(url: string, child: ChildProcess, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the reader exited with code ${child.exitCode}`);
    try {
      const res = await fetch(`${url}/api/bridge`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("the reader did not start in time");
}

export async function startReader(env: Record<string, string>): Promise<Reader> {
  const where = readerDir();
  if ("error" in where) throw new Error(where.error);

  const port = await freePort();
  const nextBin = path.join(where.dir, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, where.mode, "--port", String(port), "--hostname", "127.0.0.1"],
    {
      cwd: where.dir,
      env: { ...process.env, ...env, NEXT_TELEMETRY_DISABLED: "1" },
      // stdout belongs to the MCP protocol; the reader's logs go to stderr.
      stdio: ["ignore", process.stderr, process.stderr],
    }
  );

  const url = `http://127.0.0.1:${port}`;
  const stop = () => {
    if (child.exitCode === null) child.kill("SIGTERM");
  };
  try {
    await waitUntilUp(url, child, where.mode === "dev" ? 120_000 : 60_000);
  } catch (err) {
    stop();
    throw err;
  }
  return { url, stop };
}

// Chromium browsers can show a page as an app: its own window, no tabs or
// address bar. That makes the reader feel like an application without
// shipping one. First installed wins.
const MAC_APP_BROWSERS = ["Google Chrome", "Microsoft Edge", "Brave Browser", "Chromium", "Vivaldi"];
const LINUX_APP_BROWSERS = [
  "google-chrome",
  "google-chrome-stable",
  "microsoft-edge",
  "brave-browser",
  "chromium",
  "chromium-browser",
  "vivaldi",
];

/** The command that opens `url` as an app window, or null when no Chromium browser is installed. */
export function appWindowCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env
): [string, string[]] | null {
  const args = [`--app=${url}`, "--window-size=1440,920"];
  if (platform === "darwin") {
    const roots = ["/Applications", path.join(env.HOME ?? "", "Applications")];
    for (const name of MAC_APP_BROWSERS) {
      for (const root of roots) {
        // Running the binary directly hands --app to an already-running
        // browser; `open -a` would drop the arguments in that case.
        const bin = path.join(root, `${name}.app`, "Contents", "MacOS", name);
        if (exists(bin)) return [bin, args];
      }
    }
  } else if (platform === "linux") {
    const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
    for (const name of LINUX_APP_BROWSERS) {
      for (const dir of dirs) {
        const bin = path.join(dir, name);
        if (exists(bin)) return [bin, args];
      }
    }
  }
  return null;
}

/**
 * Show the reader: as an app window when the learner's setting allows it
 * (the default) and a Chromium browser is installed, else in the default browser.
 */
export function openBrowser(url: string): void {
  if (process.env.CURIO_NO_BROWSER) return;
  const appWindow = process.env.CURIO_READER_WINDOW === "browser" ? null : appWindowCommand(url);
  const [cmd, args] =
    appWindow ??
    (process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]);
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // The tool result carries the URL; the learner can open it by hand.
  }
}
