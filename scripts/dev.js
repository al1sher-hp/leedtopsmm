// `npm run dev` — API va dashboard'ni bir vaqtda ishga tushiradi.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(name, command, args, cwd) {
  const proc = spawn(command, args, { cwd, shell: true, stdio: 'pipe' });
  proc.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`));
  proc.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`));
  proc.on('exit', (code) => console.log(`[${name}] chiqdi, kod: ${code}`));
  return proc;
}

const api = run('api', 'node', ['--watch', 'src/api/server.js'], root);
const web = run('web', 'npm', ['run', 'dev'], path.join(root, 'web'));

process.on('SIGINT', () => {
  api.kill();
  web.kill();
  process.exit(0);
});
