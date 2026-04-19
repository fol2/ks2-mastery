import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
// `publicFinalDir` is what Wrangler serves. We build into a sibling tmp dir
// and swap atomically so the live tree is never seen half-rebuilt -- which
// was the root cause of `EBUSY` on Windows and of stale root-level files
// (e.g. a future `robots.txt`) lingering across builds.
const publicFinalDir = path.join(rootDir, "dist", "public");
const publicBuildDir = path.join(rootDir, "dist", "public.tmp");
const publicOldDir = path.join(rootDir, "dist", "public.old");
const publicSrcDir = path.join(publicBuildDir, "src");
const publicAssetsDir = path.join(publicBuildDir, "assets");
const publicVendorDir = path.join(publicBuildDir, "vendor");
const privacyDir = path.join(publicBuildDir, "privacy");
const termsDir = path.join(publicBuildDir, "terms");

function staticPage({ title, heading, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f6f2;
      --panel: #ffffff;
      --ink: #171717;
      --muted: #5f6368;
      --line: #d7d5cf;
      --accent: #1d4f91;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(180deg, #faf8f4 0%, var(--bg) 100%);
      color: var(--ink);
      font-family: "Segoe UI", system-ui, sans-serif;
      line-height: 1.6;
      padding: 32px 16px 48px;
    }

    main {
      max-width: 760px;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 18px 40px rgba(23, 23, 23, 0.06);
    }

    h1 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: clamp(2rem, 5vw, 2.8rem);
      line-height: 1.1;
    }

    h2 {
      margin-top: 28px;
      margin-bottom: 10px;
      font-size: 1.15rem;
    }

    p, li {
      color: var(--ink);
      font-size: 1rem;
    }

    .eyebrow {
      margin: 0 0 10px;
      color: var(--accent);
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.75rem;
    }

    .muted {
      color: var(--muted);
    }

    a {
      color: var(--accent);
    }
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">KS2 Mastery</p>
    <h1>${heading}</h1>
    ${bodyHtml}
  </main>
</body>
</html>`;
}

// Start from a known-empty build target. Any leftover `.tmp` / `.old` from a
// previous interrupted run is wiped up front.
await rm(publicBuildDir, { recursive: true, force: true });
await rm(publicOldDir, { recursive: true, force: true });
await mkdir(publicBuildDir, { recursive: true });
await mkdir(publicSrcDir, { recursive: true });
await mkdir(publicAssetsDir, { recursive: true });
await mkdir(publicVendorDir, { recursive: true });
await mkdir(privacyDir, { recursive: true });
await mkdir(termsDir, { recursive: true });

await cp(path.join(rootDir, "assets"), publicAssetsDir, { recursive: true });
await cp(path.join(rootDir, "vendor"), publicVendorDir, { recursive: true });

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

await writeFile(path.join(publicBuildDir, "index.html"), transformedHtml, "utf8");

await writeFile(
  path.join(privacyDir, "index.html"),
  staticPage({
    title: "KS2 Mastery Privacy Policy",
    heading: "Privacy Policy",
    bodyHtml: `
      <p class="muted">Last updated: 18 April 2026</p>
      <p>KS2 Mastery stores account details, child profiles, learning progress and session data so families can securely access the web app and continue learning across devices.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Adult account details such as email address and linked sign-in providers.</li>
        <li>Child profile details that a parent or guardian adds to the account.</li>
        <li>Learning progress, preferences and spelling session data created while using the service.</li>
        <li>Technical logs that are required to keep the service secure and available.</li>
      </ul>
      <h2>How we use data</h2>
      <ul>
        <li>To authenticate users and protect account access.</li>
        <li>To save progress, preferences and child-specific learning state.</li>
        <li>To operate, secure and improve the service.</li>
      </ul>
      <h2>Storage</h2>
      <p>Account and progress data are stored in managed cloud infrastructure used by KS2 Mastery. Audio or speech-related buffers may be stored in object storage when those features are enabled.</p>
      <h2>Children's data</h2>
      <p>Child profiles are created and managed by the adult account holder. Parents or guardians should only add information they are authorised to provide.</p>
      <h2>Contact</h2>
      <p>For privacy questions, contact <a href="mailto:fol2hk@gmail.com">fol2hk@gmail.com</a>.</p>
    `,
  }),
  "utf8",
);

await writeFile(
  path.join(termsDir, "index.html"),
  staticPage({
    title: "KS2 Mastery Terms of Service",
    heading: "Terms of Service",
    bodyHtml: `
      <p class="muted">Last updated: 18 April 2026</p>
      <p>These terms govern access to KS2 Mastery, a web application for spelling practice and progress tracking.</p>
      <h2>Use of the service</h2>
      <ul>
        <li>You must keep account credentials secure and use the service lawfully.</li>
        <li>Adult account holders are responsible for child profiles created under their account.</li>
        <li>You must not attempt to reverse engineer, disrupt or abuse the service.</li>
      </ul>
      <h2>Availability</h2>
      <p>The service is provided on an as-is basis for this proof-of-concept stage. Features may change, pause or be removed while the platform is being developed.</p>
      <h2>Content and progress</h2>
      <p>Learning progress and account data are provided to support the product experience. Users should keep their own records where this is important to them.</p>
      <h2>Contact</h2>
      <p>Questions about these terms can be sent to <a href="mailto:fol2hk@gmail.com">fol2hk@gmail.com</a>.</p>
    `,
  }),
  "utf8",
);

// Atomic swap: move the existing live tree aside, move the freshly built tree
// into place, then drop the aside. At every moment a consumer (Wrangler dev,
// deploy upload) sees either the previous complete tree or the new complete
// tree -- never an in-progress mix. This also guarantees anything that used
// to sit at the root of `dist/public` is dropped unless this build wrote it.
let hasPreviousPublicDir = false;
try {
  await rename(publicFinalDir, publicOldDir);
  hasPreviousPublicDir = true;
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
try {
  await rename(publicBuildDir, publicFinalDir);
} catch (error) {
  if (hasPreviousPublicDir) {
    try {
      await rename(publicOldDir, publicFinalDir);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Failed to promote dist/public build and rollback previous public directory",
      );
    }
  }
  throw error;
}
await rm(publicOldDir, { recursive: true, force: true });
