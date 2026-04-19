import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

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

const port = process.env.PLAYWRIGHT_PORT || String(await findAvailablePort());
const playwrightCliPath = fileURLToPath(
  new URL("../node_modules/playwright/cli.js", import.meta.url),
);

const child = spawn(process.execPath, [playwrightCliPath, "test"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_PORT: port,
  },
});

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
