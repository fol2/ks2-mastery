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

await run("npm", ["run", "build"]);

if (process.env.WORKERS_CI_BRANCH) {
  console.log(
    `[wrangler-build] Workers Builds detected for branch "${process.env.WORKERS_CI_BRANCH}"; preparing D1 schema before deploy.`,
  );
  await run("node", ["./scripts/ci-migrate-on-main.mjs"]);
} else {
  console.log(
    "[wrangler-build] No Workers Builds branch env detected; skipping CI-only schema prep in the custom Wrangler build hook.",
  );
}
