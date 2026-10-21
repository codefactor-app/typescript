import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve, join} from 'node:path';

export type Language = 'php' | 'python' | 'rust' | 'javascript' | 'typescript' | 'js' | 'ts';
export type Direction = 'callers' | 'callees' | 'both';
export interface Summary {
  files: number; functions: number; types: number; warnings: number; errors: number;
  parse_errors: number; architecture_warnings: number; [key: string]: number;
}
export interface AnalysisReport {
  version: string; schema_version: string; root: string; config_path: string | null;
  summary: Summary; files: Array<Record<string, unknown>>; metrics: Array<Record<string, unknown>>;
  violations: Array<Record<string, unknown>>; parse_errors: Array<Record<string, unknown>>;
  graph: Graph; [key: string]: unknown;
}
export interface Graph {nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; [key: string]: unknown}
export interface CommandResult<T = Record<string, unknown>> {data: T; exitCode: number; stderr: string}
export interface ScanOptions {config?: string; languages?: Language[]; architecture?: boolean; strictConfig?: boolean}
export interface ClientOptions {binary?: string; timeoutMs?: number; maxOutputBytes?: number}

export class CodefactorError extends Error {
  constructor(message: string, public readonly exitCode?: number, public readonly stderr = '') {super(message); this.name = 'CodefactorError';}
}

function absolute(path: string): string {
  if (!path || path.includes('\0')) throw new TypeError('Invalid path');
  return resolve(path);
}

export class Codefactor {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  constructor(options: ClientOptions = {}) {
    this.binary = resolve(options.binary || process.env.CODEFACTOR_BINARY || join(__dirname, '..', 'bin', `codefactor${process.platform === 'win32' ? '.exe' : ''}`));
    this.timeoutMs = options.timeoutMs ?? 120000;
    this.maxOutputBytes = options.maxOutputBytes ?? 512 * 1024 * 1024;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isSafeInteger(this.maxOutputBytes) || this.maxOutputBytes <= 0)
      throw new TypeError('Timeout and output limit must be positive');
  }

  async scan(root = '.', options: ScanOptions = {}): Promise<CommandResult<AnalysisReport>> {
    for (const key of Object.keys(options)) if (!['config', 'languages', 'architecture', 'strictConfig'].includes(key)) throw new TypeError(`Unknown scan option: ${key}`);
    const args = ['scan', '--format', 'json'];
    if (options.config) args.push('--config', absolute(options.config));
    if (options.languages) {
      if (!options.languages.length || options.languages.some(language => !['php', 'python', 'rust', 'javascript', 'typescript', 'js', 'ts'].includes(language))) throw new TypeError('Invalid languages');
      args.push('--lang', options.languages.join(','));
    }
    if (options.architecture === false) args.push('--no-architecture');
    if (options.strictConfig) args.push('--strict-config');
    const result = await this.run<AnalysisReport>([...args, '--', absolute(root)]);
    if (!result.data.schema_version || typeof result.data.summary !== 'object' || !Array.isArray(result.data.files)) throw new CodefactorError('Invalid Codefactor analysis report');
    return result;
  }

  ast(path: string, config?: string): Promise<CommandResult> {
    return this.run(['ast', '--format', 'json', ...(config ? ['--config', absolute(config)] : []), '--', absolute(path)]);
  }

  graph(selector: string, root = '.', direction: Direction = 'both', depth?: number): Promise<CommandResult<Graph>> {
    if (!['callers', 'callees', 'both'].includes(direction) || (depth !== undefined && (!Number.isSafeInteger(depth) || depth < 0))) throw new TypeError('Invalid graph direction or depth');
    return this.run(['graph', direction, '--root', absolute(root), '--format', 'json', ...(depth !== undefined ? ['--depth', String(depth)] : []), '--', selector]);
  }

  private run<T = Record<string, unknown>>(args: string[]): Promise<CommandResult<T>> {
    if (!existsSync(this.binary)) return Promise.reject(new CodefactorError('Codefactor binary missing; reinstall the npm package with scripts enabled'));
    return new Promise((resolveResult, reject) => {
      const child = spawn(this.binary, args, {shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
      const stdout: Buffer[] = [], stderr: Buffer[] = [];
      let size = 0;
      let failure: CodefactorError | undefined;
      const timer = setTimeout(() => {failure = new CodefactorError('Codefactor analysis timed out'); child.kill('SIGKILL');}, this.timeoutMs);
      const collect = (chunks: Buffer[], chunk: Buffer) => {
        size += chunk.length;
        if (size > this.maxOutputBytes) {failure = new CodefactorError('Codefactor output exceeded configured limit'); child.kill('SIGKILL');}
        else chunks.push(chunk);
      };
      child.stdout.on('data', chunk => collect(stdout, chunk));
      child.stderr.on('data', chunk => collect(stderr, chunk));
      child.on('error', () => {clearTimeout(timer); reject(new CodefactorError('Cannot start Codefactor binary'));});
      child.on('close', code => {
        clearTimeout(timer);
        if (failure) return reject(failure);
        const diagnostic = Buffer.concat(stderr).toString('utf8');
        if (code === null || ![0, 1, 2].includes(code)) return reject(new CodefactorError(`Codefactor failed (${code}): ${diagnostic.trim()}`, code ?? undefined, diagnostic));
        try {
          const data = JSON.parse(Buffer.concat(stdout).toString('utf8'));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Not an object');
          resolveResult({data, exitCode: code, stderr: diagnostic});
        } catch { reject(new CodefactorError(`Codefactor failed (${code}): ${diagnostic.trim()}`, code, diagnostic)); }
      });
    });
  }
}

export const scan = (root = '.', options: ScanOptions = {}): Promise<CommandResult<AnalysisReport>> => new Codefactor().scan(root, options);
