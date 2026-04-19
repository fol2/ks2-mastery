import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_DATABASE = "ks2-mastery-db";

function parseArgs(argv) {
  const options = {
    database: process.env.D1_DATABASE_NAME || DEFAULT_DATABASE,
    file: "",
    mode: "local",
    forceRemote: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--database") options.database = argv[++i] || options.database;
    else if (arg === "--file") options.file = argv[++i] || "";
    else if (arg === "--local") options.mode = "local";
    else if (arg === "--remote") options.mode = "remote";
    else if (arg === "--yes-really") options.forceRemote = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function usage() {
  console.log(`Usage: npm run ops:d1:restore -- --file <dump.sql> [--local|--remote] [--database <name>] [--yes-really]`);
}

function wranglerBin() {
  return process.platform === "win32"
    ? path.resolve("node_modules/.bin/wrangler.cmd")
    : path.resolve("node_modules/.bin/wrangler");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  if (!options.file) {
    throw new Error("Pass --file <dump.sql>.");
  }

  if (options.mode === "remote" && !options.forceRemote) {
    throw new Error("Remote restore is blocked by default. Re-run with --remote --yes-really once you have a fresh backup and approval.");
  }

  const input = path.resolve(options.file);
  await access(input);

  const args = [
    "d1",
    "execute",
    options.database,
    `--${options.mode}`,
    "--file",
    input,
    "--yes",
  ];

  await run(wranglerBin(), args);
  console.log(`D1 restore completed from ${input}`);
}

await main();
