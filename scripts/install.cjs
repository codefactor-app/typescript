'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const config = require('../release.json');

function download(url, limit, redirects = 0, credentials = true) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return reject(new Error('Codefactor release URL must use HTTPS'));
    const caPath = process.env.CODEFACTOR_CA_BUNDLE || (parsed.hostname === 'gitlab.local' ? path.join(root, 'certs/gitlab.local.pem') : undefined);
    const token = process.env.CODEFACTOR_TOKEN;
    const jobToken = process.env.CODEFACTOR_JOB_TOKEN || process.env.CI_JOB_TOKEN;
    const headers = credentials && parsed.hostname !== 'github.com'
      ? token ? {'PRIVATE-TOKEN': token} : jobToken ? {'JOB-TOKEN': jobToken} : {} : {};
    const request = https.get(parsed, {
      ca: caPath ? fs.readFileSync(caPath) : undefined,
      headers,
      timeout: 60000,
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        if (redirects >= 5 || Object.keys(headers).length) return reject(new Error('Unsafe Codefactor release redirect'));
        try {
          return resolve(download(new URL(response.headers.location, parsed).href, limit, redirects + 1, false));
        } catch (error) { return reject(error); }
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Codefactor download failed (${response.statusCode}); check token and published platform`));
      }
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > limit) response.destroy(new Error('Codefactor download exceeded size limit'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => request.destroy(new Error('Codefactor download timed out')));
    request.on('error', reject);
  });
}

function releaseBase(version) {
  const override = process.env.CODEFACTOR_RELEASE_BASE_URL;
  if (version === 'latest' && !override) return config.latest_url.replace(/\/$/, '');
  const base = (override || config.base_url).replace(/\/$/, '');
  return base.includes('{version}') ? base.replaceAll('{version}', version) : `${base}/${version}`;
}

async function install() {
  const platform = `${process.platform}-${process.arch}`;
  if (!config.platforms.includes(platform)) throw new Error(`No Codefactor release for ${platform}`);
  const destination = path.join(root, 'bin', `codefactor${process.platform === 'win32' ? '.exe' : ''}`);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  const metadataPath = path.join(root, 'bin/codefactor.manifest.json');
  const override = process.env.CODEFACTOR_BINARY;
  if (override) {
    if (path.resolve(override) !== destination) fs.copyFileSync(override, destination);
    fs.chmodSync(destination, 0o755);
    return destination;
  }
  const base = releaseBase(config.version);
  const manifest = JSON.parse((await download(`${base}/manifest-${platform}.json`, 65536)).toString('utf8'));
  const filename = `codefactor-${platform}${process.platform === 'win32' ? '.exe' : ''}`;
  if (typeof manifest.version !== 'string' || manifest.version !== manifest.version.trim() || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version) ||
      (config.version !== 'latest' && manifest.version !== config.version) || manifest.platform !== platform || manifest.file !== filename ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256 || '')) throw new Error('Invalid Codefactor release manifest');
  if (fs.existsSync(destination) && fs.statSync(destination).size === manifest.size &&
      crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') === manifest.sha256) {
    fs.chmodSync(destination, 0o755);
    fs.writeFileSync(metadataPath, JSON.stringify(manifest));
    return destination;
  }
  const binary = await download(`${releaseBase(manifest.version)}/${filename}`, 128 * 1024 * 1024);
  if (binary.length !== manifest.size || crypto.createHash('sha256').update(binary).digest('hex') !== manifest.sha256)
    throw new Error('Codefactor binary checksum mismatch');
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, binary, {mode: 0o755, flag: 'wx'});
    fs.renameSync(temporary, destination);
    fs.writeFileSync(metadataPath, JSON.stringify(manifest));
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return destination;
}

if (require.main === module) install().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = {install};
