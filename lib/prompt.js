'use strict';

const HOST_CHOICES = [
  { value: 'claude',   label: 'Claude Code',   hint: 'native plugin · parallel subagents · PreToolUse hook' },
  { value: 'cursor',   label: 'Cursor',        hint: 'writes .cursor/rules/god-of-debugger.mdc' },
  { value: 'codex',    label: 'Codex CLI',     hint: 'writes ./AGENTS.md' },
  { value: 'continue', label: 'Continue.dev',  hint: 'writes .continue/config.yaml' },
  { value: 'open',     label: 'open-plugins',  hint: 'copies ./.plugin/ bundle into project' }
];

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K\r`;
const UP = (n) => `${ESC}[${n}A`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const RESET = `${ESC}[0m`;

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function render(choices, index) {
  const lines = choices.map((c, i) => {
    const pointer = i === index ? `${CYAN}❯${RESET}` : ' ';
    const label = i === index ? `${BOLD}${c.label}${RESET}` : c.label;
    return `${pointer} ${label}  ${DIM}${c.hint}${RESET}`;
  });
  return lines.join('\n');
}

function pickHost({ title = 'Pick a host to install god-of-debugger:' } = {}) {
  if (!isInteractive()) return Promise.resolve(null);

  return new Promise((resolve) => {
    const choices = HOST_CHOICES;
    let index = 0;

    const out = process.stdout;
    const stdin = process.stdin;

    out.write(`${BOLD}${title}${RESET}\n`);
    out.write(HIDE_CURSOR);
    out.write(render(choices, index) + '\n');
    out.write(`${DIM}↑/↓ move · enter select · q/ctrl-c cancel${RESET}\n`);

    const totalLines = choices.length + 1;

    function redraw() {
      out.write(UP(totalLines));
      for (let i = 0; i < totalLines; i++) out.write(CLEAR_LINE + (i < totalLines - 1 ? '\n' : ''));
      out.write(UP(totalLines - 1));
      out.write(render(choices, index) + '\n');
      out.write(`${DIM}↑/↓ move · enter select · q/ctrl-c cancel${RESET}`);
    }

    function cleanup() {
      stdin.removeListener('data', onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      out.write(`\n${SHOW_CURSOR}`);
    }

    function onData(buf) {
      const s = buf.toString('utf8');
      // Ctrl-C or q
      if (s === '\x03' || s === 'q' || s === 'Q') {
        cleanup();
        resolve(null);
        return;
      }
      // Enter
      if (s === '\r' || s === '\n') {
        cleanup();
        resolve(choices[index].value);
        return;
      }
      // Arrow keys: ESC [ A / B
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
      // Number shortcuts 1..N
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

module.exports = { pickHost, HOST_CHOICES, isInteractive };
