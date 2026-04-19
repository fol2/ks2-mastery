import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_DATABASE = "ks2-mastery-db";

function parseArgs(argv) {
  const options = {
    database: process.env.D1_DATABASE_NAME || DEFAULT_DATABASE,
    output: "",
    mode: "remote",
    tables: [],
    schemaOnly: false,
    dataOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--database") options.database = argv[++i] || options.database;
    else if (arg === "--output") options.output = argv[++i] || "";
    else if (arg === "--local") options.mode = "local";
    else if (arg === "--remote") options.mode = "remote";
    else if (arg === "--table") options.tables.push(argv[++i]);
    else if (arg === "--schema-only") options.schemaOnly = true;
    else if (arg === "--data-only") options.dataOnly = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.schemaOnly && options.dataOnly) {
    throw new Error("Choose either --schema-only or --data-only, not both.");
  }

  return options;
}

function usage() {
  console.log(`Usage: npm run ops:d1:backup -- [--remote|--local] [--database <name>] [--output <file>] [--table <name>] [--schema-only|--data-only]`);
}

function wranglerBin() {
  return process.platform === "win32"
    ? path.resolve("node_modules/.bin/wrangler.cmd")
    : path.resolve("node_modules/.bin/wrangler");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function defaultOutput(database, mode) {
  return path.resolve("backups", "d1", `${database}-${mode}-${timestamp()}.sql`);
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

  const output = path.resolve(options.output || defaultOutput(options.database, options.mode));
  await mkdir(path.dirname(output), { recursive: true });

  const args = [
    "d1",
    "export",
    options.database,
    `--${options.mode}`,
    "--output",
    output,
  ];

  for (const table of options.tables.filter(Boolean)) {
    args.push("--table", table);
  }
  if (options.schemaOnly) args.push("--no-data");
  if (options.dataOnly) args.push("--no-schema");

  await run(wranglerBin(), args);
  console.log(`D1 backup written to ${output}`);
}

await main();
