#!/usr/bin/env node
'use strict';

const { install, uninstall, doctor, getVersion, SUPPORTED_HOSTS } = require('../lib/install');
const { pickHost, printBanner, isInteractive } = require('../lib/prompt');

function parseArgs(argv) {
  const out = { flags: {}, positional: [] };
  for (const a of argv) {
    if (a.startsWith('--host=')) out.flags.host = a.slice('--host='.length);
    else if (a === '--host') out.flags.host = '__next__';
    else if (out.flags.host === '__next__') out.flags.host = a;
    else if (a === '--yes' || a === '-y') out.flags.yes = true;
    else out.positional.push(a);
  }
  return out;
}

const HELP_ALIASES = new Set(['help', '-h', '--help', '-help', undefined]);
const VERSION_ALIASES = new Set(['-v', '--version', '-version', 'version']);

const cmd = process.argv[2];
const rest = process.argv.slice(3);
const { flags } = parseArgs(rest);

async function resolveHost({ verbAction }) {
  if (flags.host) return flags.host;
  if (flags.yes || !isInteractive()) return 'claude';
  const picked = await pickHost({
    title: `Pick a host to ${verbAction} god-of-debugger:`
  });
  if (picked === null) {
    console.log('cancelled.');
    process.exit(130);
  }
  return picked;
}

async function main() {
  if (HELP_ALIASES.has(cmd)) {
    printHelp();
    return;
  }
  if (VERSION_ALIASES.has(cmd)) {
    console.log(getVersion());
    return;
  }

  switch (cmd) {
    case 'install': {
      const host = await resolveHost({ verbAction: 'install' });
      return install({ host });
    }
    case 'update': {
      const host = await resolveHost({ verbAction: 'update' });
      return install({ update: true, host });
    }
    case 'uninstall': {
      const host = await resolveHost({ verbAction: 'uninstall' });
      return uninstall({ host });
    }
    case 'doctor':
      return doctor();
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  if (isInteractive()) printBanner();
  console.log(`god-of-debugger — multi-host debugging plugin installer  v${getVersion()}

Usage:
  god install                     Interactive host picker
  god install --host=<host>       Install directly (scriptable)
  god install -y                  Non-interactive, default host (claude)
  god update [--host=<host>]      Reinstall from current package version
  god uninstall [--host=<host>]   Remove plugin surface for a host
  god doctor                      Check install + repo layout health
  god --version                   Print version
  god --help                      Show this help

Hosts: ${SUPPORTED_HOSTS.join(', ')}
  claude    Claude Code plugin (installs to ~/.claude/plugins/)
  cursor    Cursor rule (writes ./.cursor/rules/god-of-debugger.mdc)
  codex     Codex CLI / AGENTS.md (writes ./AGENTS.md)
  continue  Continue.dev config (writes ./.continue/config.yaml)
  open      open-plugins bundle (copies ./.plugin/ into current project)

Tip: run plain "god install" and use ↑/↓ + enter to pick.

Docs: https://godofdebugger.bixai.dev/
`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
