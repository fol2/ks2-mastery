import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "dist", "public");
const staleProbe = path.join(publicDir, "__stale_probe__.txt");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runBuildPublic() {
  const run = spawnSync(process.execPath, ["./scripts/build-public.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(
      [
        "build-public failed while validating output contract.",
        run.stdout?.trim() || "(no stdout)",
        run.stderr?.trim() || "(no stderr)",
      ].join("\n\n"),
    );
  }
}

async function assertPathExists(filePath) {
  if (!(await exists(filePath))) {
    throw new Error(`Expected path missing: ${filePath}`);
  }
}

async function assertPathMissing(filePath) {
  if (await exists(filePath)) {
    throw new Error(`Expected temporary path to be removed: ${filePath}`);
  }
}

async function main() {
  await rm(staleProbe, { force: true });
  await mkdir(publicDir, { recursive: true });
  await writeFile(staleProbe, "stale marker", "utf8");

  // Rebuild after writing a stale probe to verify atomic swap drops old files.
  runBuildPublic();

  await assertPathExists(path.join(publicDir, "index.html"));
  await assertPathExists(path.join(publicDir, "_app"));
  await assertPathExists(path.join(publicDir, "vendor", "word-list.js"));
  await assertPathExists(path.join(publicDir, "vendor", "word-meta.js"));
  await assertPathExists(path.join(publicDir, "privacy", "index.html"));
  await assertPathExists(path.join(publicDir, "terms", "index.html"));

  const builtIndex = await readFile(path.join(publicDir, "index.html"), "utf8");
  if (!builtIndex.includes('<script type="module" crossorigin src="/_app/')) {
    throw new Error("dist/public/index.html is missing bundled Vite module entry.");
  }
  if (!builtIndex.includes('id="__ks2_boot_beacon"')) {
    throw new Error("dist/public/index.html is missing boot beacon diagnostics.");
  }

  await assertPathExists(path.join(rootDir, "src", "generated", "legacy-entry.generated.jsx"));
  await assertPathMissing(staleProbe);
  await assertPathMissing(path.join(rootDir, "dist", "public.tmp"));
  await assertPathMissing(path.join(rootDir, "dist", "public.old"));
  await assertPathMissing(path.join(rootDir, ".frontend-static"));
}

await main();
