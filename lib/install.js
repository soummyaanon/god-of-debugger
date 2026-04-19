'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_NAME = 'god-of-debugger';
const PKG_ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(PKG_ROOT, 'plugins', PLUGIN_NAME);
const PKG_JSON = require(path.join(PKG_ROOT, 'package.json'));

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
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

async function install({ update = false } = {}) {
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
    JSON.stringify({ source: 'npm', version: getVersion(), installedAt: new Date().toISOString() }, null, 2)
  );
  console.log(`Installed ${PLUGIN_NAME}@${getVersion()} → ${dest}`);
  console.log(`Restart Claude Code to pick up the plugin.`);
}

async function uninstall() {
  const dest = getPluginRoot();
  if (!fs.existsSync(dest)) {
    console.log(`Not installed: ${dest}`);
    return;
  }
  rmrf(dest);
  console.log(`Removed ${dest}`);
}

async function doctor() {
  const dest = getPluginRoot();
  console.log(`Package version : ${getVersion()}`);
  console.log(`Plugin dir      : ${dest}`);
  if (!fs.existsSync(dest)) {
    console.log(`Status          : NOT INSTALLED`);
    return;
  }
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(path.join(dest, '.install-source.json'), 'utf8')); } catch {}
  console.log(`Install source  : ${manifest.source || 'unknown'}`);
  console.log(`Installed version: ${manifest.version || 'unknown'}`);
  const pluginJson = path.join(dest, '.claude-plugin', 'plugin.json');
  console.log(`plugin.json     : ${fs.existsSync(pluginJson) ? 'OK' : 'MISSING'}`);
  if (manifest.version && manifest.version !== getVersion()) {
    console.log(`\nUpdate available. Run: god update`);
  }
}

module.exports = { install, uninstall, doctor, getVersion };
