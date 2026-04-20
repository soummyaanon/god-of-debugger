#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

const targets = [
  path.join(root, 'plugins', 'god-of-debugger', '.claude-plugin', 'plugin.json'),
  path.join(root, '.plugin', 'plugin.json')
];

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.log(`Skipping (missing): ${path.relative(root, target)}`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
  const rel = path.relative(root, target);
  if (manifest.version !== pkg.version) {
    manifest.version = pkg.version;
    fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Synced ${rel} → ${pkg.version}`);
  } else {
    console.log(`${rel} already at ${pkg.version}`);
  }
}

const continueCfg = path.join(root, '.continue', 'config.yaml');
if (fs.existsSync(continueCfg)) {
  const original = fs.readFileSync(continueCfg, 'utf8');
  const updated = original.replace(/^version:\s.*$/m, `version: ${pkg.version}`);
  if (updated !== original) {
    fs.writeFileSync(continueCfg, updated);
    console.log(`Synced .continue/config.yaml → ${pkg.version}`);
  }
}
