'use strict';

const HOST_CHOICES = [
  { value: 'claude',   label: 'Claude Code',   hint: 'native plugin · parallel subagents · PreToolUse hook' },
  { value: 'cursor',   label: 'Cursor',        hint: 'writes .cursor/rules/god-of-debugger.mdc' },
  { value: 'codex',    label: 'Codex CLI',     hint: 'writes ./AGENTS.md' },
  { value: 'continue', label: 'Continue.dev',  hint: 'writes .continue/config.yaml' },
  { value: 'open',     label: 'open-plugins',  hint: 'copies ./.plugin/ bundle into project' }
];

const ESC = '\x1b';
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const CLEAR_DOWN = `${ESC}[J`;
const PREV_LINE = (n) => `${ESC}[${n}F`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const MAGENTA = `${ESC}[35m`;
const RESET = `${ESC}[0m`;

const BANNER = [
  `${MAGENTA}   _____           _        __  _____       _                               ${RESET}`,
  `${MAGENTA}  / ____|         | |      / _||  __ \\     | |                              ${RESET}`,
  `${MAGENTA} | |  __  ___   __| |  ___| |_ | |  | | ___| |__  _   _  __ _  __ _  ___ _ __${RESET}`,
  `${MAGENTA} | | |_ |/ _ \\ / _\` | / _ \\  _|| |  | |/ _ \\ '_ \\| | | |/ _\` |/ _\` |/ _ \\ '__|${RESET}`,
  `${MAGENTA} | |__| | (_) | (_| || (_) | |  | |__| |  __/ |_) | |_| | (_| | (_| |  __/ |  ${RESET}`,
  `${MAGENTA}  \\_____|\\___/ \\__,_| \\___/|_|  |_____/ \\___|_.__/ \\__,_|\\__, |\\__, |\\___|_|  ${RESET}`,
  `${MAGENTA}                                                          __/ | __/ |         ${RESET}`,
  `${MAGENTA}                                                         |___/ |___/          ${RESET}`,
  `${DIM}  falsification-first · hypothesis-driven · parallel debugging${RESET}`
];

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function printBanner() {
  for (const line of BANNER) process.stdout.write(line + '\n');
  process.stdout.write('\n');
}

function choiceLines(choices, index) {
  return choices.map((c, i) => {
    const pointer = i === index ? `${CYAN}❯${RESET}` : ' ';
    const label = i === index ? `${BOLD}${c.label}${RESET}` : c.label;
    return `${pointer} ${label}  ${DIM}${c.hint}${RESET}`;
  });
}

function pickHost({ title = 'Pick a host to install god-of-debugger:', showBanner = true } = {}) {
  if (!isInteractive()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const choices = HOST_CHOICES;
    let index = 0;

    const out = process.stdout;
    const stdin = process.stdin;

    if (showBanner) printBanner();

    const header = `${BOLD}${title}${RESET}`;
    const footer = `${DIM}↑/↓ move · enter select · 1-${choices.length} jump · q/ctrl-c cancel${RESET}`;

    // Initial render
    out.write(HIDE_CURSOR);
    out.write(header + '\n');
    for (const line of choiceLines(choices, index)) out.write(line + '\n');
    out.write(footer + '\n');

    const bodyLines = choices.length + 1; // choices + footer (we keep header frozen above)

    function redraw() {
      // Move cursor to start of first choice line, clear everything below, redraw
      out.write(PREV_LINE(bodyLines));
      out.write(CLEAR_DOWN);
      for (const line of choiceLines(choices, index)) out.write(line + '\n');
      out.write(footer + '\n');
    }

    function cleanup() {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      out.write(SHOW_CURSOR);
    }

    function onData(buf) {
      const s = buf.toString('utf8');
      if (s === '\x03' || s === 'q' || s === 'Q') {
        cleanup();
        resolve(null);
        return;
      }
      if (s === '\r' || s === '\n') {
        cleanup();
        resolve(choices[index].value);
        return;
      }
      if (s === '\x1b[A' || s === 'k') {
        index = (index - 1 + choices.length) % choices.length;
        redraw();
        return;
      }
      if (s === '\x1b[B' || s === 'j') {
        index = (index + 1) % choices.length;
        redraw();
        return;
      }
      const n = parseInt(s, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= choices.length) {
        index = n - 1;
        redraw();
      }
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
  });
}

module.exports = { pickHost, printBanner, HOST_CHOICES, isInteractive };
