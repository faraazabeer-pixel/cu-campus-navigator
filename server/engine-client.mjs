// Supervises the C++ route engine process (JSON-lines over stdin/stdout).
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

export class EngineClient extends EventEmitter {
  constructor({ binary, dataPath, timeoutMs = 5000, maxRestarts = 5 }) {
    super();
    Object.assign(this, { binary, dataPath, timeoutMs, maxRestarts });
    this.proc = null; this.pending = new Map(); this.nextId = 1; this.ready = null; this.restarts = 0; this.closed = false; this.info = null;
  }

  static exists(binary) { try { fs.accessSync(binary, fs.constants.X_OK); return true; } catch { return false; } }

  start() {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve, reject) => {
      if (!EngineClient.exists(this.binary)) return reject(new Error(`route engine binary not found at ${this.binary} - run "npm run build:engine"`));
      const proc = spawn(this.binary, ['serve', this.dataPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.proc = proc;
      let first = true, stderr = '';
      proc.stderr.on('data', (d) => { stderr += d; });
      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        let msg; try { msg = JSON.parse(line); } catch { return; }
        if (first) { first = false; this.info = msg; return resolve(msg); }
        const p = this.pending.get(msg.id);
        if (p) { clearTimeout(p.timer); this.pending.delete(msg.id); p.resolve(msg); }
      });
      proc.on('error', (e) => { reject(e); this.#fail(e); });
      proc.on('exit', (code, sig) => {
        const err = new Error(`route engine exited (code ${code}, signal ${sig})${stderr ? ': ' + stderr.trim() : ''}`);
        if (first) { first = false; reject(err); }
        this.#fail(err);
        this.proc = null; this.ready = null;
        if (!this.closed && this.restarts < this.maxRestarts) { this.restarts++; setTimeout(() => this.start().catch(() => {}), 200 * this.restarts); }
      });
    });
    this.ready.catch(() => {});
    return this.ready;
  }

  #fail(err) { for (const [, p] of this.pending) { clearTimeout(p.timer); p.reject(err); } this.pending.clear(); }

  async request(payload) {
    await this.start();
    if (!this.proc) throw new Error('route engine is not running');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('route engine timed out')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify({ ...payload, id }) + '\n');
    });
  }

  close() { this.closed = true; this.#fail(new Error('closed')); if (this.proc) { this.proc.stdin.end(); this.proc.kill(); } }
}
