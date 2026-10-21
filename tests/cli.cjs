'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync, spawn} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const launcher = path.resolve(__dirname, '../scripts/cli.cjs');

test('CLI preserves arguments, cwd, streams and arbitrary exit status', {skip: process.platform === 'win32'}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codefactor cli ; '));
  try {
    const fake = path.join(root, 'fake engine');
    fs.writeFileSync(fake, `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),input:require('node:fs').readFileSync(0,'utf8')}));\nprocess.stderr.write('raw diagnostic\\n');\nprocess.exitCode=7;\n`, {mode: 0o755});
    const args = ['scan', '--future-option', 'path ; $(literal)', '--', 'quoted "value"'];
    const env = {...process.env, CODEFACTOR_BINARY: fake};
    const result = spawnSync(process.execPath, [launcher, ...args], {cwd: root, env, input: 'stdin data\n', encoding: 'utf8'});
    assert.equal(result.status, 7);
    assert.deepEqual(JSON.parse(result.stdout), {args, cwd: fs.realpathSync(root), input: 'stdin data\n'});
    assert.equal(result.stderr, 'raw diagnostic\n');
    const missing = spawnSync(process.execPath, [launcher, '--version'], {env: {...env, CODEFACTOR_BINARY: path.join(root, 'missing')}, encoding: 'utf8'});
    assert.equal(missing.status, 127);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Cannot start Codefactor binary/);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('CLI forwards termination signals to core', {skip: process.platform === 'win32', timeout: 5000}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codefactor signal '));
  let child;
  try {
    const fake = path.join(root, 'engine');
    fs.writeFileSync(fake, `#!${process.execPath}\nprocess.stdout.write('ready\\n');\nsetInterval(() => {}, 1000);\n`, {mode: 0o755});
    child = spawn(process.execPath, [launcher], {env: {...process.env, CODEFACTOR_BINARY: fake}, stdio: ['ignore', 'pipe', 'pipe']});
    await once(child.stdout, 'data');
    const finished = once(child, 'exit');
    child.kill('SIGTERM');
    const [status, signal] = await finished;
    assert.equal(status, null);
    assert.equal(signal, 'SIGTERM');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    fs.rmSync(root, {recursive: true, force: true});
  }
});
