import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

// One local helper, JSON over stdin/stdout. No shell interpolation or credentials.
export class DesktopBridge {
  constructor() { this.pending = new Map(); this.sequence = 0; }
  async start() {
    if (process.platform !== 'win32') throw new Error('Desktop connection needs Windows 10 or 11. Share-link players work on any platform.');
    if (this.child) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const script = await readFile(new URL('./windows-media.ps1', import.meta.url), 'utf8');
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Mta', '-Command', script], {
        windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
      });
      this.child = child;
      const lines = createInterface({ input: child.stdout });
      lines.on('line', line => {
        let response;
        try { response = JSON.parse(line); } catch { return; }
        const entry = this.pending.get(response.id);
        if (!entry) return;
        clearTimeout(entry.timer); this.pending.delete(response.id);
        response.error ? entry.reject(new Error(response.error)) : entry.resolve(response.result);
      });
      child.stdin.on('error', () => this.stop('The Windows media connection closed. Try connecting again.'));
      child.on('error', () => this.stop('Windows media controls could not start. Check that Windows PowerShell is available.'));
      child.on('exit', () => {
        if (this.child === child) this.stop('The Windows media connection closed. Try connecting again.');
        lines.close();
      });
    })();
    try { await this.starting; } finally { this.starting = null; }
  }
  async request(command, sessionId = '', position) {
    await this.start();
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.stop('Windows media controls timed out. Try connecting again.'), 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, command, sessionId, position }) + '\n');
    });
  }
  stop(message = 'Desktop connection closed.') {
    const child = this.child; this.child = null;
    child?.stdin.end(); child?.kill();
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(message)); }
    this.pending.clear();
  }
}
