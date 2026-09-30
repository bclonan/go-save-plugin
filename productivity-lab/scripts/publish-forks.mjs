#!/usr/bin/env node
/**
 * Assemble and test three MIT-based ChatGPT apps, then optionally publish true
 * GitHub forks. Default mode never creates or changes a GitHub repository.
 * Requires Node.js 22+, npm, git, and (for --publish) an authenticated gh CLI.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const OWNER = 'bclonan';
const APP_BRANCH = 'chatgpt-app';
const BUNDLE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPS = Object.freeze([
  { slug: 'csv-rescue', upstream: 'mholt/PapaParse', repository: 'csv-rescue-chatgpt' },
  { slug: 'pocket-pdf', upstream: 'Hopding/pdf-lib', repository: 'pocket-pdf-chatgpt' },
  { slug: 'instant-slides', upstream: 'gitbrent/PptxGenJS', repository: 'instant-slides-chatgpt' },
]);
const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(['--publish', '--dry-run', '--help']);
let temporaryRoot;

function fail(message) { throw new Error(message); }

function run(command, argv, options = {}) {
  try {
    return execFileSync(command, argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
      ...options,
      shell: false,
    });
  } catch (error) {
    // Do not echo process environments, credential helpers, or raw API errors.
    fail(command + ' failed' + (Number.isInteger(error.status) ? ' (exit ' + error.status + ')' : '') +
      '. Verify its installation, authentication, and network access, then retry.');
  }
}

function api(endpoint, { optional = false, fields } = {}) {
  const argv = ['api', '--hostname', 'github.com', endpoint];
  if (fields) {
    argv.push('--method', 'POST');
    for (const [key, value] of Object.entries(fields)) {
      argv.push(typeof value === 'boolean' ? '-F' : '-f', key + '=' + String(value));
    }
  }
  try {
    return JSON.parse(execFileSync('gh', argv, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024, timeout: 30_000, shell: false,
    }));
  } catch (error) {
    // A confirmed 404 is the only response treated as an absent repository/ref.
    const stderr = String(error.stderr || '');
    let status;
    try { status = JSON.parse(String(error.stdout || '')).status; } catch {}
    if (optional && (/\(HTTP 404\)/.test(stderr) || String(status) === '404')) return null;
    fail('GitHub API request failed for ' + endpoint +
      '. Check gh authentication, permissions, connectivity, and API limits.');
  }
}

function copySource(source, destination) {
  const excluded = new Set(['.git', 'node_modules', 'artifacts', 'coverage', '.cache', '.DS_Store']);
  if (!existsSync(source)) fail('Missing source: ' + source);
  if (lstatSync(source).isSymbolicLink()) fail('Refusing to copy a symbolic link: ' + source);
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    if (entry.name === '.env' || (entry.name.startsWith('.env.') && entry.name !== '.env.example')) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isSymbolicLink()) fail('Refusing to copy a symbolic link: ' + from);
    if (entry.isDirectory()) copySource(from, to);
    else if (entry.isFile()) copyFileSync(from, to);
    else fail('Unsupported source entry: ' + from);
  }
}

function requireFile(path) {
  if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
    fail('Required regular file is missing: ' + path);
  }
}

function assemble(app) {
  const staged = join(temporaryRoot, 'validated-apps', app.slug);
  copySource(join(BUNDLE, 'apps', app.slug), staged);
  for (const path of ['package.json', 'src/tools.js', 'test/tools.test.js', 'README.md']) {
    requireFile(join(staged, path));
  }
  for (const name of ['server.js', 'artifacts.js']) {
    const source = join(BUNDLE, 'runtime', name);
    requireFile(source);
    copyFileSync(source, join(staged, 'src', name));
  }
  // The extracted app must run without referencing the parent bundle.
  const packagePath = join(staged, 'package.json');
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  manifest.type = 'module';
  manifest.private = true;
  manifest.engines = { ...manifest.engines, node: '>=22' };
  manifest.scripts = { start: 'node src/server.js', test: 'node --test' };
  writeFileSync(packagePath, JSON.stringify(manifest, null, 2) + '\n');
  const gitignorePath = join(staged, '.gitignore');
  const previous = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  writeFileSync(gitignorePath, previous + '\nnode_modules/\nartifacts/\n.env\n.env.*\n!.env.example\ncoverage/\n');
  console.log('Installing and testing ' + app.slug + ' in ' + staged);
  const npm = 'npm';
  run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: staged, stdio: 'inherit' });
  run(npm, ['test'], { cwd: staged, stdio: 'inherit' });
  requireFile(join(staged, 'package-lock.json'));
  return { ...app, staged, fullName: OWNER + '/' + app.repository };
}

function assertExpectedFork(metadata, app) {
  if (!metadata || metadata.full_name?.toLowerCase() !== app.fullName.toLowerCase() ||
      metadata.owner?.login?.toLowerCase() !== OWNER.toLowerCase() ||
      metadata.fork !== true || metadata.parent?.full_name?.toLowerCase() !== app.upstream.toLowerCase()) {
    fail('Refusing destination ' + app.fullName + ': it must be a fork whose direct parent is ' + app.upstream + '.');
  }
  if (metadata.archived || metadata.disabled) fail('Destination is archived or disabled: ' + app.fullName);
}

function appRef(app) {
  return 'repos/' + app.fullName + '/git/ref/heads/' + APP_BRANCH;
}

async function waitForFork(app) {
  for (let attempt = 0; attempt < 24; attempt++) {
    const repository = api('repos/' + app.fullName, { optional: true });
    if (repository) {
      assertExpectedFork(repository, app);
      if (repository.default_branch) {
        const ref = api('repos/' + app.fullName + '/git/ref/heads/' +
          encodeURIComponent(repository.default_branch), { optional: true });
        if (ref?.object?.sha) return repository;
      }
    }
    if (attempt % 4 === 0) console.log('Waiting for GitHub to finish preparing ' + app.fullName + '…');
    await delay(2500);
  }
  fail('Fork is still being prepared: ' + app.fullName + '. Retry later; the existing fork can be resumed if its app branch is absent.');
}

async function main() {
  for (const arg of args) if (!allowedArgs.has(arg)) fail('Unknown argument: ' + arg);
  if (args.has('--help')) {
    console.log('Usage: node productivity-lab/scripts/publish-forks.mjs [--dry-run | --publish]\n' +
      'Default: assemble all apps in a new temporary directory, install dependencies, and run tests.\n' +
      '--publish: after all tests pass, authenticate as bclonan, create/resume the specified forks,\n' +
      'and push a new chatgpt-app branch. Existing app branches are never intentionally updated.\n' +
      'Temporary files are retained for inspection. No default branches or pull requests are changed.');
    return;
  }
  if (args.has('--publish') && args.has('--dry-run')) fail('Choose either --publish or --dry-run.');
  if (Number(process.versions.node.split('.')[0]) < 22) fail('Node.js 22 or newer is required.');

  if (process.platform === 'win32') fail('Run this script in WSL, Linux, or macOS so npm can be executed directly without a command shell.');
  const publish = args.has('--publish');
  console.log(publish ? 'Publish requested; all app tests must pass before repository changes.' :
    'Dry run: all apps will be assembled and tested; GitHub repositories will not be changed.');
  temporaryRoot = mkdtempSync(join(tmpdir(), 'productivity-lab-publish-'));
  console.log('Working directory: ' + temporaryRoot);
  const apps = APPS.map(assemble);
  console.log('All three app test commands passed.');
  for (const app of apps) console.log(app.upstream + ' -> ' + app.fullName + ' (branch ' + APP_BRANCH + ')');
  if (!publish) {
    console.log('Dry run complete. Publish with: node ' + fileURLToPath(import.meta.url) + ' --publish');
    return;
  }

  run('git', ['--version']);
  run('gh', ['--version']);
  const identity = api('user');
  if (identity.login?.toLowerCase() !== OWNER.toLowerCase() || !Number.isSafeInteger(identity.id) || identity.id <= 0) {
    fail('Refusing to publish: gh must be authenticated to github.com as ' + OWNER + '.');
  }

  // Finish all read-only collision and license checks before the first fork request.
  for (const app of apps) {
    const upstream = api('repos/' + app.upstream);
    if (upstream.license?.spdx_id !== 'MIT') fail('Upstream is no longer reported as MIT: ' + app.upstream);
    const existing = api('repos/' + app.fullName, { optional: true });
    if (existing) {
      assertExpectedFork(existing, app);
      if (api(appRef(app), { optional: true })) {
        fail('Refusing to change existing branch ' + app.fullName + ':' + APP_BRANCH + '.');
      }
    }
    app.existing = Boolean(existing);
  }

  const hooksDirectory = join(temporaryRoot, 'empty-hooks');
  mkdirSync(hooksDirectory);
  // Git invokes this fixed credential helper when needed. Credentials stay in gh;
  // no token is printed, written into a remote URL, or passed as a process argument.
  const gitFlags = [
    '-c', 'core.hooksPath=' + hooksDirectory,
    '-c', 'credential.helper=',
    '-c', 'credential.helper=!gh auth git-credential',
    '-c', 'credential.https://github.com.username=' + OWNER,
  ];
  const git = (argv, options = {}) => run('git', [...gitFlags, ...argv], {
    ...options, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' },
  });
  const prepared = [];

  for (const app of apps) {
    if (!app.existing) {
      console.log('Creating fork ' + app.fullName + ' from ' + app.upstream);
      const created = api('repos/' + app.upstream + '/forks', {
        fields: { name: app.repository, default_branch_only: false },
      });
      if (created.full_name?.toLowerCase() !== app.fullName.toLowerCase()) {
        fail('GitHub returned a different fork destination. Expected ' + app.fullName + '; no app branch was pushed.');
      }
    } else console.log('Resuming verified fork ' + app.fullName);
    const repository = await waitForFork(app);
    if (api(appRef(app), { optional: true })) fail('App branch now exists; refusing to continue: ' + app.fullName);
    const checkout = join(temporaryRoot, 'fork-' + app.slug);
    // A full clone retains upstream history. Never use --depth or orphan branches.
    git(['clone', '--no-checkout', '--', 'https://github.com/' + app.fullName + '.git', checkout]);
    git(['checkout', '--no-track', '-b', APP_BRANCH, 'origin/' + repository.default_branch], { cwd: checkout });
    const appDirectory = join(checkout, 'chatgpt-app');
    if (existsSync(appDirectory)) fail('Upstream already contains chatgpt-app/: ' + app.fullName);
    copySource(app.staged, appDirectory);
    // -f applies only to our assembled app, so an upstream ignore rule cannot omit it.
    git(['add', '--force', '--', 'chatgpt-app'], { cwd: checkout });
    const stagedFiles = git(['diff', '--cached', '--name-only', '-z'], { cwd: checkout }).split('\0').filter(Boolean);
    if (!stagedFiles.length || stagedFiles.some(path => !path.startsWith('chatgpt-app/'))) {
      fail('Unexpected staged paths in ' + app.fullName + '; refusing to commit.');
    }
    git([
      '-c', 'user.name=' + OWNER,
      '-c', 'user.email=' + identity.id + '+' + OWNER + '@users.noreply.github.com',
      '-c', 'commit.gpgsign=false',
      'commit', '-m', 'Add ' + app.slug + ' ChatGPT MCP app',
    ], { cwd: checkout });
    prepared.push({ ...app, checkout });
  }

  for (const app of prepared) {
    // Recheck immediately before each normal, non-force push.
    if (api(appRef(app), { optional: true }) ||
        git(['ls-remote', '--heads', 'origin', 'refs/heads/' + APP_BRANCH], { cwd: app.checkout }).trim()) {
      fail('App branch appeared before push; refusing to change ' + app.fullName + '.');
    }
    git(['push', 'origin', 'HEAD:refs/heads/' + APP_BRANCH], { cwd: app.checkout, stdio: 'inherit' });
    console.log('Published: https://github.com/' + app.fullName + '/tree/' + APP_BRANCH + '/chatgpt-app');
  }
  console.log('Finished. Upstream default branches and licenses are preserved.');
}

main().catch(error => {
  console.error('Stopped: ' + error.message);
  if (temporaryRoot) console.error('Temporary files retained at ' + temporaryRoot);
  console.error('Completed fork requests or pushes are not rolled back. No force push or deletion was attempted.');
  process.exitCode = 1;
});
