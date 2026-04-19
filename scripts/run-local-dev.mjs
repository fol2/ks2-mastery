import { spawn } from "node:child_process";

function parsePersistTo(args) {
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--persist-to") {
      return args[index + 1];
    }
    if (value.startsWith("--persist-to=")) {
      return value.slice("--persist-to=".length);
    }
  }
  return process.env.WRANGLER_PERSIST_TO || "";
}

function run(command, args, extraArgs = [], envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, ...extraArgs], {
      shell: process.platform === "win32",
      stdio: "inherit",
      env: { ...process.env, ...envOverrides },
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

const forwardedArgs = process.argv.slice(2);
const persistTo = parsePersistTo(forwardedArgs);
const persistArgs = persistTo ? ["--persist-to", persistTo] : [];

await run("npm", ["run", "build"]);
await run("npx", ["wrangler", "d1", "migrations", "apply", "ks2-mastery-db", "--local"], persistArgs, { CI: "1" });
await run("npx", ["wrangler", "d1", "execute", "ks2-mastery-db", "--local", "--file", "./scripts/d1-backfill.sql"], persistArgs, { CI: "1" });
await run("npx", ["wrangler", "dev", "--local"], forwardedArgs);
