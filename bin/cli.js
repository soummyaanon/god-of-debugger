#!/usr/bin/env node
'use strict';

const { install, uninstall, doctor, getVersion } = require('../lib/install');

const cmd = process.argv[2];

async function main() {
  switch (cmd) {
    case 'install':
      return install();
    case 'update':
      return install({ update: true });
    case 'uninstall':
      return uninstall();
    case 'doctor':
      return doctor();
    case '-v':
    case '--version':
      console.log(getVersion());
      return;
    case 'help':
    case '-h':
    case '--help':
    case undefined:
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`god-of-debugger — Claude Code plugin installer

Usage:
  god install       Install plugin into Claude Code config dir
  god update        Reinstall from current package version
  god uninstall     Remove plugin
  god doctor        Check install health
  god --version     Print version

Docs: https://godofdebugger.bixai.dev/
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
