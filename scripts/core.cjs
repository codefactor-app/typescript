'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const release = require('../release.json');
const platform = `${process.platform}-${process.arch}`;
const executable = process.platform === 'win32' ? 'codefactor.exe' : 'codefactor';
class ConfigError extends Error {}
const valueOptions = new Set(['--config', '--file', '--root', '--format', '--out', '--lang', '--limit', '--group-by', '--function', '--from', '--to', '--depth', '--max-paths', '--architecture-profile', '--log-level', '--color', '--port', '--host', '--a', '--b', '--category']);
function argumentContext(args, cwd = process.cwd()) {
  let config, root;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { positional.push(...args.slice(i + 1)); break; }
    if (arg.startsWith('--')) {
      const separator = arg.indexOf('=');
      const key = separator < 0 ? arg : arg.slice(0, separator);
      if (valueOptions.has(key)) {
        const value = separator < 0 ? args[++i] : arg.slice(separator + 1);
        if (key === '--config' || (key === '--file' && positional[0] === 'config')) config = value;
        if (key === '--root') root = value;
      }
    } else if (!arg.startsWith('-')) positional.push(arg);
  }
  if (root === undefined && ['scan', 'metrics', 'serve', 'ast'].includes(positional[0])) root = positional[1];
  if (config === undefined && positional[0] === 'config' && ['check', 'show'].includes(positional[1])) config = 'analyzer.yaml';
  return {config, root: root ? path.resolve(cwd, root) : cwd, cwd};
}
function selection(context = {}) {
  const cwd = context.cwd || process.cwd();
  const requestedRoot = path.resolve(cwd, context.root || '.');
  const root = fs.existsSync(requestedRoot) ? fs.realpathSync(requestedRoot) : requestedRoot;
  const directory = fs.existsSync(root) && fs.statSync(root).isFile() ? path.dirname(root) : root;
  let config = context.config ? path.resolve(cwd, context.config) : ['analyzer.yaml', 'analyzer.yml'].map(name => path.join(directory, name)).find(file => fs.existsSync(file));
  if (config && fs.existsSync(config)) config = fs.realpathSync(config);
  let version = process.env.CODEFACTOR_CORE_VERSION;
  if (config) {
    let document;
    try { document = require('yaml').parse(fs.readFileSync(config, 'utf8'), {maxAliasCount: 100, uniqueKeys: true}); }
    catch (error) { throw new ConfigError(error.message); }
    if (document !== null && (typeof document !== 'object' || Array.isArray(document))) throw new ConfigError('Codefactor config must be a mapping');
    if (version === undefined && document && Object.hasOwn(document, 'core')) {
      if (!document.core || typeof document.core !== 'object' || Array.isArray(document.core)) throw new ConfigError('core must be a mapping');
      version = Object.hasOwn(document.core, 'version') ? document.core.version : undefined;
    }
  }
  version = version === undefined ? 'latest' : version;
  if (typeof version !== 'string' || version !== version.trim() || !/^(latest|[0-9]+\.[0-9]+\.[0-9]+)$/.test(version)) throw new ConfigError('core.version must be latest or X.Y.Z');
  const base = process.env.CODEFACTOR_RELEASE_BASE_URL || release.base_url;
  const latest = process.env.CODEFACTOR_RELEASE_BASE_URL ? '' : release.latest_url;
  const source = crypto.createHash('sha256').update(`${base.replace(/\/+$/, '')}\n${latest.replace(/\/+$/, '')}`).digest('hex');
  return {version, directory: path.join(config ? path.dirname(config) : directory, '.codefactor', 'core', source, platform)};
}
function validateManifest(manifest, version = 'latest') {
  if (!manifest || typeof manifest.version !== 'string' || manifest.version !== manifest.version.trim() || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version) ||
      (version !== 'latest' && manifest.version !== version) || manifest.platform !== platform ||
      manifest.file !== `codefactor-${platform}${process.platform === 'win32' ? '.exe' : ''}` ||
      typeof manifest.sha256 !== 'string' || manifest.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isSafeInteger(manifest.size) || manifest.size <= 0 || manifest.size > 128 * 1024 * 1024)
    throw new Error('Invalid Codefactor release manifest');
  return manifest;
}
function cachedPath(directory, manifest) { return path.join(directory, manifest.version, manifest.sha256, executable); }
function verified(binary, manifest) {
  return fs.existsSync(binary) && fs.statSync(binary).size === manifest.size && crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex') === manifest.sha256;
}
function resolveBinary(context = {}) {
  if (process.env.CODEFACTOR_BINARY) return path.resolve(process.env.CODEFACTOR_BINARY);
  const {version, directory} = selection(context);
  const active = path.join(directory, 'active.json');
  if (fs.existsSync(active)) {
    const manifest = validateManifest(JSON.parse(fs.readFileSync(active, 'utf8')));
    if (version === 'latest' || manifest.version === version) {
      const binary = cachedPath(directory, manifest);
      if (!verified(binary, manifest)) throw new Error('Codefactor cached binary is damaged; run codefactor core update');
      return binary;
    }
  }
  if (version !== 'latest') {
    const versions = path.join(directory, version);
    for (const hash of fs.existsSync(versions) ? fs.readdirSync(versions).sort() : []) {
      const metadata = path.join(versions, hash, 'codefactor.manifest.json');
      if (!fs.existsSync(metadata)) continue;
      const manifest = validateManifest(JSON.parse(fs.readFileSync(metadata, 'utf8')), version);
      const binary = cachedPath(directory, manifest);
      if (hash === manifest.sha256 && verified(binary, manifest)) return binary;
    }
  }
  const binary = path.join(__dirname, '..', 'bin', executable);
  if (fs.existsSync(binary)) {
    const metadata = path.join(path.dirname(binary), 'codefactor.manifest.json');
    if (version === 'latest') return binary;
    if (fs.existsSync(metadata)) {
      const manifest = validateManifest(JSON.parse(fs.readFileSync(metadata, 'utf8')));
      if (manifest.version === version && verified(binary, manifest)) return binary;
    }
  }
  throw new Error(`Codefactor Core ${version} is not installed; run codefactor core update${context.config ? ` --config ${context.config}` : ''}`);
}
async function update(context = {}) {
  if (process.env.CODEFACTOR_BINARY) {
    const binary = path.resolve(process.env.CODEFACTOR_BINARY);
    if (!fs.statSync(binary).isFile()) throw new Error('CODEFACTOR_BINARY does not point to a file');
    return {binary, version: 'external'};
  }
  const {version, directory} = selection(context);
  fs.mkdirSync(directory, {recursive: true});
  const lock = path.join(directory, '.update.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { fs.mkdirSync(lock); acquired = true; break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!acquired) throw new Error(`Codefactor update is locked; if no update is running remove ${lock}`);
  let temporary;
  try {
    const installer = require('./install.cjs');
    const manifest = validateManifest(JSON.parse((await installer.download(`${installer.releaseBase(version)}/manifest-${platform}.json`, 65536)).toString('utf8')), version);
    const binary = cachedPath(directory, manifest);
    await installer.install({version, destination: binary, manifest});
    temporary = path.join(directory, `.active-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
    fs.writeFileSync(temporary, JSON.stringify(manifest), {flag: 'wx'});
    fs.renameSync(temporary, path.join(directory, 'active.json'));
    return {binary, version: manifest.version};
  } finally {
    if (temporary && fs.existsSync(temporary)) fs.unlinkSync(temporary);
    fs.rmdirSync(lock);
  }
}
async function updateCommand(args) {
  if (args.includes('--help') || args.includes('-h')) { console.log('Usage: codefactor core update [--config PATH]'); return; }
  if (args[0] !== 'update') throw new Error('Usage: codefactor core update [--config PATH]');
  let config;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--config' && args[i + 1]) config = args[++i];
    else if (args[i].startsWith('--config=') && args[i].length > 9) config = args[i].slice(9);
    else throw new Error('Usage: codefactor core update [--config PATH]');
  }
  const result = await update({config});
  console.log(`Codefactor Core ${result.version}: ${result.binary}`);
}
module.exports = {ConfigError, argumentContext, selection, validateManifest, resolveBinary, update, updateCommand};
