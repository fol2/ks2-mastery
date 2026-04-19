import { spawn } from "node:child_process";

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });
}

const workersCiBranch = process.env.WORKERS_CI_BRANCH;

if (!workersCiBranch) {
  console.log(
    "[wrangler-build] No Workers Builds branch env detected; skipping the custom Wrangler build hook.",
  );
  process.exit(0);
}

console.log(
  `[wrangler-build] Workers Builds detected for branch "${workersCiBranch}"; running the production build and applying D1 schema prep only when explicitly opted in.`,
);
await run("npm", ["run", "build"]);
await run("node", ["./scripts/ci-migrate-on-main.mjs"]);
