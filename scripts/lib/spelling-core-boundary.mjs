import { readFile, realpath } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, transform } from 'esbuild';

const DEFAULT_CORE_ROOT = path.join('shared', 'spelling', 'core');
const CORE_ENTRY_NAME = 'index.js';
const ERROR_SEVERITY = 'error';

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => {
  const bareName = name.startsWith('node:') ? name.slice('node:'.length) : name;
  return [bareName, `node:${bareName}`];
}));

const ALLOWED_MATH_PROPERTIES = Object.freeze(
  Object.getOwnPropertyNames(Math)
    .filter((property) => property !== 'random')
    .sort(compareText),
);

const AMBIENT_MESSAGES = Object.freeze({
  browserStorage: 'Browser storage globals are not allowed in portable spelling core.',
  clock: 'Ambient Date access is not allowed in portable spelling core; inject now().',
  random: 'Ambient Math access is not allowed in portable spelling core; inject random().',
  global: 'Browser ambient globals are not allowed in portable spelling core.',
  console: 'Direct console access is not allowed in portable spelling core; inject diagnostics.',
  node: 'Node ambient globals are not allowed in portable spelling core.',
});

const STORAGE_PROPERTIES = Object.freeze(['localStorage', 'sessionStorage', 'indexedDB']);
const CONSOLE_PROPERTIES = Object.freeze(['console']);

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalisePath(filePath) {
  return filePath.split(path.sep).join('/').replaceAll('\\', '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueIdentifier(base, source, reserved = new Set()) {
  let suffix = 0;
  let candidate = base;
  while (source.includes(candidate) || reserved.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  reserved.add(candidate);
  return candidate;
}

function createAmbientProbe(source) {
  const reserved = new Set();
  const sentinels = {
    browserStorage: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_BROWSER_STORAGE_GLOBAL__', source, reserved),
    clock: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_AMBIENT_CLOCK__', source, reserved),
    random: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_AMBIENT_RANDOM__', source, reserved),
    globalThis: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_GLOBAL_THIS__', source, reserved),
    window: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_WINDOW__', source, reserved),
    document: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_DOCUMENT__', source, reserved),
    console: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_DIRECT_CONSOLE__', source, reserved),
    process: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_NODE_PROCESS__', source, reserved),
    Buffer: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_NODE_BUFFER__', source, reserved),
    nodeGlobal: uniqueIdentifier('__KS2_SPELLING_BOUNDARY_NODE_GLOBAL__', source, reserved),
  };
  const defines = {
    'globalThis.localStorage': sentinels.browserStorage,
    'globalThis.sessionStorage': sentinels.browserStorage,
    'globalThis.indexedDB': sentinels.browserStorage,
    'window.localStorage': sentinels.browserStorage,
    'window.sessionStorage': sentinels.browserStorage,
    'window.indexedDB': sentinels.browserStorage,
    localStorage: sentinels.browserStorage,
    sessionStorage: sentinels.browserStorage,
    indexedDB: sentinels.browserStorage,
    'globalThis.console': sentinels.console,
    'window.console': sentinels.console,
    console: sentinels.console,
    'Date.now': sentinels.clock,
    Date: sentinels.clock,
    'Math.random': sentinels.random,
    Math: sentinels.random,
    globalThis: sentinels.globalThis,
    window: sentinels.window,
    document: sentinels.document,
    process: sentinels.process,
    Buffer: sentinels.Buffer,
    global: sentinels.nodeGlobal,
  };
  for (const property of ALLOWED_MATH_PROPERTIES) {
    defines[`Math.${property}`] = uniqueIdentifier(
      `__KS2_SPELLING_BOUNDARY_ALLOWED_MATH_${property.toUpperCase()}__`,
      source,
      reserved,
    );
  }
  return { defines, sentinels };
}

function destructurePattern(rootSentinel, properties) {
  const propertyPattern = properties.map(escapeRegExp).join('|');
  return new RegExp(
    `\\{[^{}]*\\b(?:${propertyPattern})\\b[^{}]*\\}\\s*=\\s*${escapeRegExp(rootSentinel)}\\b`,
    'g',
  );
}

function filesystemPath(value, fallback) {
  const resolvedValue = value ?? fallback;
  if (resolvedValue instanceof URL) return fileURLToPath(resolvedValue);
  return String(resolvedValue);
}

function isInside(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (
    relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath)
  );
}

function repoRelativePath(repoRoot, absolutePath) {
  return normalisePath(path.relative(repoRoot, absolutePath)) || '.';
}

function absoluteImportPath(repoRoot, importer) {
  return path.isAbsolute(importer) ? importer : path.resolve(repoRoot, importer);
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith('.')
    || path.isAbsolute(specifier)
    || /^[A-Za-z]:[\\/]/.test(specifier);
}

function dependencyCode(repoRoot, targetPath) {
  if (!isInside(repoRoot, targetPath)) return 'import_escape';
  const relativeTarget = repoRelativePath(repoRoot, targetPath);
  if (relativeTarget === 'worker' || relativeTarget.startsWith('worker/')) {
    return 'worker_dependency';
  }
  if (
    relativeTarget === 'shared/hero'
    || relativeTarget.startsWith('shared/hero/')
    || relativeTarget === 'src/subjects'
    || relativeTarget.startsWith('src/subjects/')
    || relativeTarget.startsWith('src/platform/hubs/parent')
    || relativeTarget.startsWith('src/platform/game/')
  ) {
    return 'cross_subject_dependency';
  }
  return 'import_escape';
}

function importMessage(code, specifier) {
  const messages = {
    import_escape: `Import resolves outside portable spelling core: ${specifier}.`,
    bare_package: `Bare package imports are not allowed in portable spelling core: ${specifier}.`,
    node_builtin: `Node built-ins are not allowed in portable spelling core: ${specifier}.`,
    worker_dependency: `Worker dependencies are not allowed in portable spelling core: ${specifier}.`,
    cross_subject_dependency: `Cross-subject dependencies are not allowed in portable spelling core: ${specifier}.`,
    dynamic_import: `Dynamic imports are not allowed in portable spelling core: ${specifier}.`,
    commonjs_require: `CommonJS require calls are not allowed in portable spelling core: ${specifier}.`,
  };
  return messages[code];
}

function createIssueCollector() {
  const issueMap = new Map();
  return {
    add(code, issuePath, message) {
      const issue = {
        severity: ERROR_SEVERITY,
        code,
        path: normalisePath(issuePath),
        message,
      };
      const key = `${issue.code}\u0000${issue.path}`;
      if (!issueMap.has(key)) issueMap.set(key, issue);
    },
    sorted() {
      return [...issueMap.values()].sort((left, right) => (
        compareText(left.path, right.path)
        || compareText(left.code, right.code)
        || compareText(left.message, right.message)
      ));
    },
  };
}

function createBoundaryPlugin({ repoRoot, coreRoot, issues }) {
  return {
    name: 'spelling-core-boundary',
    setup(buildContext) {
      buildContext.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return undefined;

        const importerPath = repoRelativePath(repoRoot, absoluteImportPath(repoRoot, args.importer));
        if (args.kind === 'dynamic-import') {
          issues.add('dynamic_import', importerPath, importMessage('dynamic_import', args.path));
          return { path: args.path, external: true };
        }
        if (args.kind === 'require-call') {
          issues.add('commonjs_require', importerPath, importMessage('commonjs_require', args.path));
          return { path: args.path, external: true };
        }
        if (NODE_BUILTINS.has(args.path)) {
          issues.add('node_builtin', importerPath, importMessage('node_builtin', args.path));
          return { path: args.path, external: true };
        }
        if (!isLocalSpecifier(args.path)) {
          issues.add('bare_package', importerPath, importMessage('bare_package', args.path));
          return { path: args.path, external: true };
        }

        const targetPath = path.resolve(args.resolveDir || repoRoot, args.path);
        if (!isInside(coreRoot, targetPath)) {
          const code = dependencyCode(repoRoot, targetPath);
          issues.add(code, importerPath, importMessage(code, args.path));
          return { path: targetPath, external: true };
        }
        return undefined;
      });
    },
  };
}

async function scanAmbientGlobals({ source, issuePath, issues }) {
  const probe = createAmbientProbe(source);
  const transformed = await transform(source, {
    loader: 'js',
    format: 'esm',
    legalComments: 'none',
    treeShaking: false,
    define: probe.defines,
  });
  const code = transformed.code;
  if (code.includes(probe.sentinels.browserStorage)) {
    issues.add('browser_storage_global', issuePath, AMBIENT_MESSAGES.browserStorage);
  }
  if (code.includes(probe.sentinels.clock)) {
    issues.add('ambient_clock', issuePath, AMBIENT_MESSAGES.clock);
  }
  if (code.includes(probe.sentinels.random)) {
    issues.add('ambient_random', issuePath, AMBIENT_MESSAGES.random);
  }
  if (code.includes(probe.sentinels.console)) {
    issues.add('direct_console', issuePath, AMBIENT_MESSAGES.console);
  }
  if (
    code.includes(probe.sentinels.process)
    || code.includes(probe.sentinels.Buffer)
    || code.includes(probe.sentinels.nodeGlobal)
  ) {
    issues.add('node_ambient', issuePath, AMBIENT_MESSAGES.node);
  }
  if (code.includes(probe.sentinels.document)) {
    issues.add('ambient_global', issuePath, AMBIENT_MESSAGES.global);
  }

  let remainingRootCode = code;
  for (const rootSentinel of [probe.sentinels.globalThis, probe.sentinels.window]) {
    if (destructurePattern(rootSentinel, STORAGE_PROPERTIES).test(code)) {
      issues.add('browser_storage_global', issuePath, AMBIENT_MESSAGES.browserStorage);
    }
    if (destructurePattern(rootSentinel, CONSOLE_PROPERTIES).test(code)) {
      issues.add('direct_console', issuePath, AMBIENT_MESSAGES.console);
    }
    remainingRootCode = remainingRootCode.replace(
      destructurePattern(rootSentinel, [...STORAGE_PROPERTIES, ...CONSOLE_PROPERTIES]),
      (match) => match.replace(rootSentinel, ''),
    );
    if (remainingRootCode.includes(rootSentinel)) {
      issues.add('ambient_global', issuePath, AMBIENT_MESSAGES.global);
    }
  }
}

async function scanRuntimeModuleLoading({ source, sourcePath, issuePath, issues }) {
  const requireSentinel = uniqueIdentifier(
    '__KS2_SPELLING_BOUNDARY_RUNTIME_REQUIRE__',
    source,
  );
  const requireProbe = await transform(source, {
    loader: 'js',
    format: 'esm',
    legalComments: 'none',
    treeShaking: false,
    define: { require: requireSentinel },
  });
  if (requireProbe.code.includes(requireSentinel)) {
    issues.add('commonjs_require', issuePath, importMessage('commonjs_require', '<runtime>'));
  }

  let probe;
  try {
    probe = await build({
      stdin: {
        contents: source,
        sourcefile: issuePath,
        // A file path cannot contain glob matches. Esbuild rewrites template or
        // concatenated import paths to an import glob, which then fails here in
        // a parser-derived way instead of walking unrelated repository files.
        resolveDir: sourcePath,
        loader: 'js',
      },
      bundle: true,
      write: false,
      metafile: true,
      platform: 'neutral',
      format: 'esm',
      logLevel: 'silent',
      supported: { 'dynamic-import': false },
      define: { require: requireSentinel },
      plugins: [{
        name: 'spelling-core-runtime-import-probe',
        setup(buildContext) {
          buildContext.onResolve({ filter: /.*/ }, (args) => {
            if (args.kind === 'entry-point') return undefined;
            return { path: args.path, external: true };
          });
        },
      }],
    });
  } catch (error) {
    const rejectedImportGlob = error?.errors?.some((entry) => (
      typeof entry?.text === 'string' && entry.text.startsWith('Could not resolve import(')
    ));
    if (!rejectedImportGlob) throw error;
    issues.add('dynamic_import', issuePath, importMessage('dynamic_import', '<runtime>'));
    return;
  }
  const hasRuntimeDynamicImport = Object.values(probe.metafile?.inputs || {}).some((input) => (
    input.imports?.some((entry) => entry.path === '<runtime>')
  ));
  if (hasRuntimeDynamicImport) {
    issues.add('dynamic_import', issuePath, importMessage('dynamic_import', '<runtime>'));
  }
}

function reportShape({ rootPath, entryPath, inputs, outsideCount, issues }) {
  const sortedIssues = issues.sorted();
  return {
    ok: sortedIssues.length === 0,
    root: rootPath,
    entry: entryPath,
    inputs: [...inputs].sort(compareText),
    resolvedInputsOutsideCore: outsideCount,
    issues: sortedIssues,
  };
}

export async function verifySpellingCoreBoundary({
  repoRoot: rawRepoRoot = process.cwd(),
  coreRoot: rawCoreRoot = DEFAULT_CORE_ROOT,
  entry: rawEntry,
} = {}) {
  const requestedRepoRoot = path.resolve(filesystemPath(rawRepoRoot, process.cwd()));
  const repoRoot = await realpath(requestedRepoRoot);
  const requestedCoreRootValue = filesystemPath(rawCoreRoot, DEFAULT_CORE_ROOT);
  const requestedCoreRoot = path.isAbsolute(requestedCoreRootValue)
    ? requestedCoreRootValue
    : path.resolve(repoRoot, requestedCoreRootValue);
  const coreRoot = await realpath(requestedCoreRoot);
  const reportRoot = repoRelativePath(repoRoot, requestedCoreRoot);
  const requestedEntryValue = rawEntry === undefined
    ? path.join(requestedCoreRoot, CORE_ENTRY_NAME)
    : filesystemPath(rawEntry);
  const requestedEntry = path.isAbsolute(requestedEntryValue)
    ? requestedEntryValue
    : path.resolve(repoRoot, requestedEntryValue);
  const reportEntry = repoRelativePath(repoRoot, requestedEntry);
  const issues = createIssueCollector();
  const inputPaths = new Set();
  const outsideInputs = new Set();

  if (!isInside(repoRoot, coreRoot)) {
    issues.add(
      'import_escape',
      reportRoot,
      'Portable spelling core root resolves outside repository.',
    );
    return reportShape({
      rootPath: reportRoot,
      entryPath: reportEntry,
      inputs: inputPaths,
      outsideCount: 1,
      issues,
    });
  }

  if (!isInside(requestedCoreRoot, requestedEntry)) {
    issues.add(
      'import_escape',
      reportEntry,
      'Portable spelling core entry resolves outside its allowed root.',
    );
    return reportShape({
      rootPath: reportRoot,
      entryPath: reportEntry,
      inputs: inputPaths,
      outsideCount: 1,
      issues,
    });
  }

  let portableEntry;
  try {
    portableEntry = await realpath(requestedEntry);
  } catch {
    issues.add(
      'bundle_error',
      reportEntry,
      'Portable spelling core could not be bundled.',
    );
    return reportShape({
      rootPath: reportRoot,
      entryPath: reportEntry,
      inputs: inputPaths,
      outsideCount: 0,
      issues,
    });
  }
  if (!isInside(coreRoot, portableEntry)) {
    issues.add(
      'import_escape',
      reportEntry,
      'Portable spelling core entry resolves outside its allowed root.',
    );
    return reportShape({
      rootPath: reportRoot,
      entryPath: reportEntry,
      inputs: inputPaths,
      outsideCount: 1,
      issues,
    });
  }

  let result;
  try {
    result = await build({
      entryPoints: [portableEntry],
      absWorkingDir: repoRoot,
      bundle: true,
      write: false,
      metafile: true,
      platform: 'neutral',
      format: 'esm',
      logLevel: 'silent',
      plugins: [createBoundaryPlugin({ repoRoot, coreRoot, issues })],
    });
  } catch {
    issues.add(
      'bundle_error',
      reportEntry,
      'Portable spelling core could not be bundled.',
    );
    return reportShape({
      rootPath: reportRoot,
      entryPath: reportEntry,
      inputs: inputPaths,
      outsideCount: 0,
      issues,
    });
  }

  const metafileInputs = Object.keys(result.metafile?.inputs || {}).sort(compareText);
  for (const metafileInput of metafileInputs) {
    const absoluteInput = path.isAbsolute(metafileInput)
      ? metafileInput
      : path.resolve(repoRoot, metafileInput);
    let canonicalInput;
    try {
      canonicalInput = await realpath(absoluteInput);
    } catch {
      issues.add(
        'bundle_error',
        reportEntry,
        'Portable spelling core could not be bundled.',
      );
      continue;
    }

    const inputPath = repoRelativePath(repoRoot, canonicalInput);
    inputPaths.add(inputPath);
    if (!isInside(coreRoot, canonicalInput)) {
      outsideInputs.add(canonicalInput);
      const code = dependencyCode(repoRoot, canonicalInput);
      issues.add(
        code,
        inputPath,
        importMessage(code, inputPath),
      );
    }

    const source = await readFile(canonicalInput, 'utf8');
    try {
      await scanAmbientGlobals({ source, issuePath: inputPath, issues });
      await scanRuntimeModuleLoading({
        source,
        sourcePath: canonicalInput,
        issuePath: inputPath,
        issues,
      });
    } catch {
      issues.add(
        'bundle_error',
        reportEntry,
        'Portable spelling core could not be bundled.',
      );
    }
  }

  return reportShape({
    rootPath: reportRoot,
    entryPath: reportEntry,
    inputs: inputPaths,
    outsideCount: outsideInputs.size,
    issues,
  });
}
