// start.js - Cross-platform launcher for LifeLink (Express + Python FastAPI)
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine Python executable path across Windows and POSIX/Linux
function getPythonExecutable() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const isWin = process.platform === 'win32';
  const venvPythonWin = path.join(__dirname, 'backend', 'venv', 'Scripts', 'python.exe');
  const venvPythonPosix = path.join(__dirname, 'backend', 'venv', 'bin', 'python');

  if (isWin && fs.existsSync(venvPythonWin)) {
    return venvPythonWin;
  }
  if (!isWin && fs.existsSync(venvPythonPosix)) {
    return venvPythonPosix;
  }

  // Fallback to system python3 or python
  return process.platform === 'win32' ? 'python' : 'python3';
}

const pythonBin = getPythonExecutable();
console.log(`[LifeLink] Using Python binary: ${pythonBin}`);

// 1. Spawn FastAPI microservice on port 8001
const pyProcess = spawn(pythonBin, ['-m', 'uvicorn', 'backend.main:app', '--port', '8001', '--host', '0.0.0.0'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

// 2. Spawn Node.js Express server on port 8000 (or PORT env)
const nodeProcess = spawn('node', ['server.js'], {
  stdio: 'inherit',
  shell: true,
  cwd: __dirname
});

function cleanup() {
  console.log('[LifeLink] Shutting down services...');
  if (pyProcess && !pyProcess.killed) {
    pyProcess.kill();
  }
  if (nodeProcess && !nodeProcess.killed) {
    nodeProcess.kill();
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

pyProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[LifeLink] Python microservice exited with code ${code}`);
  }
});

nodeProcess.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`[LifeLink] Node.js server exited with code ${code}`);
  }
  cleanup();
});
