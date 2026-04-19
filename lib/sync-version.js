#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const pluginJsonPath = path.join(root, 'plugins', 'god-of-debugger', '.claude-plugin', 'plugin.json');
const plugin = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));

if (plugin.version !== pkg.version) {
  plugin.version = pkg.version;
  fs.writeFileSync(pluginJsonPath, JSON.stringify(plugin, null, 2) + '\n');
  console.log(`Synced plugin.json version → ${pkg.version}`);
} else {
  console.log(`plugin.json already at ${pkg.version}`);
}
