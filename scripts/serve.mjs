import { spawn } from 'node:child_process'

const children = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
]

let exiting = false
const stop = (signal = 'SIGTERM') => {
  if (exiting) return
  exiting = true
  for (const child of children) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop(signal))
for (const child of children) {
  child.on('exit', (code) => {
    if (!exiting) {
      stop()
      process.exitCode = code ?? 1
    }
  })
}
