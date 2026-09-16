import { spawn, type ChildProcess } from 'node:child_process'

function run(command: string, args: string[]): ChildProcess {
  return spawn(command, args, { stdio: 'inherit', shell: false })
}

const backend = run('npx', ['tsx', 'watch', 'backend/src/index.ts'])
const frontend = run('npx', ['vite', '--config', 'frontend/vite.config.ts'])

function shutdown(): void {
  backend.kill('SIGTERM')
  frontend.kill('SIGTERM')
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

backend.on('exit', (code) => {
  if (code) frontend.kill('SIGTERM')
})
frontend.on('exit', (code) => {
  if (code) backend.kill('SIGTERM')
})
