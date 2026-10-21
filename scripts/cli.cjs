#!/usr/bin/env node
'use strict';
const {spawn} = require('node:child_process');
const path = require('node:path');

const binary = process.env.CODEFACTOR_BINARY || path.join(__dirname, '..', 'bin', `codefactor${process.platform === 'win32' ? '.exe' : ''}`);
const child = spawn(binary, process.argv.slice(2), {stdio: 'inherit', shell: false});
const handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM']) {
  const handler = () => child.kill(signal);
  handlers.set(signal, handler);
  process.on(signal, handler);
}
function cleanup() {
  for (const [signal, handler] of handlers) process.removeListener(signal, handler);
}
child.on('error', error => {
  cleanup();
  console.error(`Cannot start Codefactor binary: ${error.message}. Reinstall the npm package with scripts enabled.`);
  process.exitCode = error.code === 'ENOENT' ? 127 : 126;
});
child.on('exit', (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
