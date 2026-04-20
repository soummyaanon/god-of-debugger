'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_NAME = 'god-of-debugger';
const PKG_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PKG_ROOT, 'plugins', PLUGIN_NAME);
const PKG_JSON = require(path.join(PKG_ROOT, 'package.json'));

const SUPPORTED_HOSTS = ['claude', 'cursor', 'codex', 'continue', 'open'];

function getVersion() {
  return PKG_JSON.version;
}

function getPluginRoot() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'plugins', PLUGIN_NAME);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isSymbolicLink()) {
      try {
        const realSrc = fs.realpathSync(s);
        const stat = fs.statSync(realSrc);
        if (stat.isDirectory()) copyDir(realSrc, d);
        else fs.copyFileSync(realSrc, d);
      } catch {
        fs.symlinkSync(fs.readlinkSync(s), d);
      }
    }
    else fs.copyFileSync(s, d);
  }
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

async function installClaude({ update = false } = {}) {
  const dest = getPluginRoot();
  if (!fs.existsSync(SRC_DIR)) {
    throw new Error(`Bundled plugin not found at ${SRC_DIR}`);
  }
  if (fs.existsSync(dest)) {
    const manifestPath = path.join(dest, '.install-source.json');
    let existing = null;
    try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {}
    if (existing && existing.source !== 'npm' && !update) {
      console.error(`Existing non-npm install detected at ${dest} (source: ${existing.source || 'unknown'}).`);
      console.error(`Uninstall it first or run: god update`);
      process.exit(1);
    }
    rmrf(dest);
  }
  copyDir(SRC_DIR, dest);
  fs.writeFileSync(
    path.join(dest, '.install-source.json'),
    JSON.stringify({ source: 'npm', host: 'claude', version: getVersion(), installedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`Installed ${PLUGIN_NAME}@${getVersion()} → ${dest}`);
  console.log(`Restart Claude Code to pick up the plugin.`);
}

function projectDir() {
  return process.cwd();
}

function resolveMaybeMissing(p) {
  let cur = path.resolve(p);
  const tail = [];
  while (!fs.existsSync(cur)) {
    tail.unshift(path.basename(cur));
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  try { cur = fs.realpathSync(cur); } catch {}
  return tail.length ? path.join(cur, ...tail) : cur;
}

function assertNotSelfInstall(src, dest) {
  const srcReal = fs.realpathSync(src);
  const destReal = resolveMaybeMissing(dest);
  const srcWithSep = srcReal + path.sep;
  const destWithSep = destReal + path.sep;
  if (srcReal === destReal || destWithSep.startsWith(srcWithSep) || srcWithSep.startsWith(destWithSep)) {
    console.error(`Refusing to install: source and destination overlap.`);
    console.error(`  source: ${srcReal}`);
    console.error(`  dest:   ${destReal}`);
    console.error(`Run this command from a DIFFERENT project directory (not inside the plugin's own repo).`);
    process.exit(1);
  }
  const pkgRootReal = fs.realpathSync(PKG_ROOT);
  if (destWithSep.startsWith(pkgRootReal + path.sep)) {
    console.error(`Refusing to install into the plugin's own repo at ${pkgRootReal}.`);
    console.error(`cd into a different project directory and try again.`);
    process.exit(1);
  }
}

async function installCursor() {
  const src = path.join(PKG_ROOT, '.cursor', 'rules', 'god-of-debugger.mdc');
  const dest = path.join(projectDir(), '.cursor', 'rules', 'god-of-debugger.mdc');
  if (!fs.existsSync(src)) throw new Error(`Cursor rule missing at ${src}`);
  assertNotSelfInstall(src, dest);
  copyFile(src, dest);
  console.log(`Installed Cursor rule → ${dest}`);
  console.log(`Open Cursor settings → Rules to confirm it loaded.`);
}

async function installCodex() {
  const src = path.join(PKG_ROOT, 'AGENTS.md');
  const dest = path.join(projectDir(), 'AGENTS.md');
  if (!fs.existsSync(src)) throw new Error(`AGENTS.md missing at ${src}`);
  assertNotSelfInstall(src, dest);
  if (fs.existsSync(dest)) {
    console.error(`AGENTS.md already exists at ${dest}. Merge manually or remove it first.`);
    process.exit(1);
  }
  copyFile(src, dest);
  console.log(`Installed AGENTS.md → ${dest}`);
}

async function installContinue() {
  const src = path.join(PKG_ROOT, '.continue', 'config.yaml');
  const dest = path.join(projectDir(), '.continue', 'config.yaml');
  if (!fs.existsSync(src)) throw new Error(`.continue/config.yaml missing at ${src}`);
  assertNotSelfInstall(src, dest);
  if (fs.existsSync(dest)) {
    console.error(`${dest} already exists. Merge manually (Continue has one config per project).`);
    process.exit(1);
  }
  copyFile(src, dest);
  console.log(`Installed Continue config → ${dest}`);
}

async function installOpen() {
  const srcRoot = path.join(PKG_ROOT, '.plugin');
  const dest = path.join(projectDir(), '.plugin');
  if (!fs.existsSync(srcRoot)) throw new Error(`.plugin/ missing at ${srcRoot}`);
  assertNotSelfInstall(srcRoot, dest);
  if (fs.existsSync(dest)) rmrf(dest);
  copyDir(srcRoot, dest);
  console.log(`Installed open-plugins bundle → ${dest}`);
}

async function install({ update = false, host = 'claude' } = {}) {
  if (!SUPPORTED_HOSTS.includes(host)) {
    throw new Error(`Unsupported host: ${host}. Choose from: ${SUPPORTED_HOSTS.join(', ')}`);
  }
  switch (host) {
    case 'claude': return installClaude({ update });
    case 'cursor': return installCursor();
    case 'codex': return installCodex();
    case 'continue': return installContinue();
    case 'open': return installOpen();
  }
}

async function uninstall({ host = 'claude' } = {}) {
  if (host === 'claude') {
    const dest = getPluginRoot();
    if (!fs.existsSync(dest)) {
      console.log(`Not installed: ${dest}`);
      return;
    }
    rmrf(dest);
    console.log(`Removed ${dest}`);
    return;
  }
  const targets = {
    cursor: path.join(projectDir(), '.cursor', 'rules', 'god-of-debugger.mdc'),
    codex: path.join(projectDir(), 'AGENTS.md'),
    continue: path.join(projectDir(), '.continue', 'config.yaml'),
    open: path.join(projectDir(), '.plugin')
  };
  const t = targets[host];
  if (!t) throw new Error(`Unsupported host: ${host}`);
  if (!fs.existsSync(t)) {
    console.log(`Not installed: ${t}`);
    return;
  }
  rmrf(t);
  console.log(`Removed ${t}`);
}

async function doctor() {
  const dest = getPluginRoot();
  console.log(`Package version : ${getVersion()}`);
  console.log(`Plugin dir      : ${dest}`);
  if (fs.existsSync(dest)) {
    let manifest = {};
    try { manifest = JSON.parse(fs.readFileSync(path.join(dest, '.install-source.json'), 'utf8')); } catch {}
    console.log(`Claude install  : OK`);
    console.log(`  source        : ${manifest.source || 'unknown'}`);
    console.log(`  version       : ${manifest.version || 'unknown'}`);
    const pluginJson = path.join(dest, '.claude-plugin', 'plugin.json');
    console.log(`  plugin.json   : ${fs.existsSync(pluginJson) ? 'OK' : 'MISSING'}`);
    if (manifest.version && manifest.version !== getVersion()) {
      console.log(`  update avail  : run "god update"`);
    }
  } else {
    console.log(`Claude install  : NOT INSTALLED`);
  }

  console.log(`\nOpen-plugins layout (repo):`);
  const layoutChecks = [
    ['.plugin/plugin.json', path.join(PKG_ROOT, '.plugin', 'plugin.json')],
    ['.plugin/skills', path.join(PKG_ROOT, '.plugin', 'skills')],
    ['.plugin/agents', path.join(PKG_ROOT, '.plugin', 'agents')],
    ['.plugin/hooks', path.join(PKG_ROOT, '.plugin', 'hooks')],
    ['.plugin/rules/god-of-debugger.md', path.join(PKG_ROOT, '.plugin', 'rules', 'god-of-debugger.md')],
    ['.mcp.json', path.join(PKG_ROOT, '.mcp.json')],
    ['.lsp.json', path.join(PKG_ROOT, '.lsp.json')],
    ['.cursor/rules/god-of-debugger.mdc', path.join(PKG_ROOT, '.cursor', 'rules', 'god-of-debugger.mdc')],
    ['AGENTS.md', path.join(PKG_ROOT, 'AGENTS.md')],
    ['.continue/config.yaml', path.join(PKG_ROOT, '.continue', 'config.yaml')]
  ];
  for (const [label, p] of layoutChecks) {
    console.log(`  ${label.padEnd(38)} ${fs.existsSync(p) ? 'OK' : 'MISSING'}`);
  }
}

module.exports = { install, uninstall, doctor, getVersion, SUPPORTED_HOSTS };
