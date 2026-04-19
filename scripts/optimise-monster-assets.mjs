import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const assetDir = path.join(rootDir, "assets", "monsters");
const tmpDir = await mkdtemp(path.join(os.tmpdir(), "ks2-monsters-"));

function runOrThrow(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }
}

try {
  const entries = await readdir(assetDir, { withFileTypes: true });
  const pngFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".png"))
    .map((entry) => entry.name)
    .sort();

  if (pngFiles.length === 0) {
    console.log("No PNG monster assets found, nothing to optimise.");
    process.exit(0);
  }

  for (const filename of pngFiles) {
    const inputPath = path.join(assetDir, filename);
    const baseName = filename.slice(0, -4);
    const resized320 = path.join(tmpDir, `${baseName}.320.png`);
    const resized640 = path.join(tmpDir, `${baseName}.640.png`);
    const output320 = path.join(assetDir, `${baseName}.320.webp`);
    const output640 = path.join(assetDir, `${baseName}.640.webp`);

    runOrThrow("magick", [inputPath, "-resize", "320x320", resized320]);
    runOrThrow("magick", [inputPath, "-resize", "640x640", resized640]);
    runOrThrow("cwebp", ["-quiet", "-q", "82", resized320, "-o", output320]);
    runOrThrow("cwebp", ["-quiet", "-q", "84", resized640, "-o", output640]);

    console.log(`Optimised ${filename} -> ${path.basename(output320)}, ${path.basename(output640)}`);
  }
} finally {
  await rm(tmpDir, { recursive: true, force: true });
}
