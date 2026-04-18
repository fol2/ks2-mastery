import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");
const publicSrcDir = path.join(publicDir, "src");
const publicAssetsDir = path.join(publicDir, "assets");

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicSrcDir, { recursive: true });
await mkdir(publicAssetsDir, { recursive: true });

await cp(path.join(rootDir, "assets"), publicAssetsDir, { recursive: true });

const clientSourceFiles = [
  "app.jsx",
  "collection.jsx",
  "dashboard.jsx",
  "icons.jsx",
  "monster-overlay.jsx",
  "monsters.jsx",
  "practice.jsx",
  "primitives.jsx",
  "profile.jsx",
  "questions.jsx",
  "shell.jsx",
  "spelling-dashboard.jsx",
  "spelling-game.jsx",
  "spelling-summary.jsx",
  "tabs.jsx",
  "tokens.jsx",
  "tts-core.jsx",
  "tts-settings.jsx",
  "client-store.jsx",
  "spelling-api.jsx",
];

for (const filename of clientSourceFiles) {
  await cp(
    path.join(rootDir, "src", filename),
    path.join(publicSrcDir, filename),
  );
}

const htmlSource = await readFile(path.join(rootDir, "KS2 Unified.html"), "utf8");

const scriptBlock = [
  '  <script type="text/babel" src="src/tokens.jsx"></script>',
  '  <script type="text/babel" src="src/icons.jsx"></script>',
  '  <script type="text/babel" src="src/primitives.jsx"></script>',
  '  <script type="text/babel" src="src/shell.jsx"></script>',
  '  <script type="text/babel" src="src/client-store.jsx"></script>',
  '  <script type="text/babel" src="src/profile.jsx"></script>',
  '  <script type="text/babel" src="src/monsters.jsx"></script>',
  '  <script type="text/babel" src="src/monster-overlay.jsx"></script>',
  '  <script type="text/babel" src="src/collection.jsx"></script>',
  '  <script type="text/babel" src="src/dashboard.jsx"></script>',
  '',
  '  <script src="src/tts-core.jsx"></script>',
  '  <script type="text/babel" src="src/tts-settings.jsx"></script>',
  '  <script type="text/babel" src="src/spelling-api.jsx"></script>',
  '  <script type="text/babel" src="src/spelling-dashboard.jsx"></script>',
  '  <script type="text/babel" src="src/spelling-game.jsx"></script>',
  '  <script type="text/babel" src="src/spelling-summary.jsx"></script>',
  '',
  '  <script type="text/babel" src="src/questions.jsx"></script>',
  '  <script type="text/babel" src="src/practice.jsx"></script>',
  '  <script type="text/babel" src="src/tabs.jsx"></script>',
  '  <script type="text/babel" src="src/app.jsx"></script>',
].join("\n");

const transformedHtml = htmlSource
  .replace(/<title>[\s\S]*?<\/title>/, "<title>KS2 Mastery</title>")
  .replace(/[\r\n]+  <!-- Content:[\s\S]*?<\/body>/m, `\n${scriptBlock}\n</body>`);

await writeFile(path.join(publicDir, "index.html"), transformedHtml, "utf8");
