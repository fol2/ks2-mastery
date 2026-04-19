import net from "node:net";
import { spawn } from "node:child_process";

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 8788;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function resolvePort() {
  const raw = process.env.PLAYWRIGHT_PORT;
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(
      `PLAYWRIGHT_PORT must be an integer between 1 and 65535 (got ${JSON.stringify(raw)})`,
    );
  }
  return String(parsed);
}

const port = resolvePort() ?? String(await findAvailablePort());

// Forward extra CLI args (e.g. `npm run test:e2e -- --headed spelling.spec.js`)
// so the wrapper stays transparent to local debugging workflows.
const forwardedArgs = process.argv.slice(2);

const child = spawn(
  "npm",
  ["exec", "--", "playwright", "test", ...forwardedArgs],
  {
    shell: process.platform === "win32",
    stdio: "inherit",
    env: {
      ...process.env,
      PLAYWRIGHT_PORT: port,
    },
  },
);

// Forward terminations so GH Actions cancellations (SIGTERM) or local Ctrl-C
// (SIGINT) actually tear the Playwright/Wrangler subtree down instead of
// orphaning it and holding the port.
const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"];
for (const signal of forwardedSignals) {
  process.on(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
