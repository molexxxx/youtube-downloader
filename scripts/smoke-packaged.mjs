/**
 * Launches the packaged app in dist/ with --smoke-test and exits with its status, so a build is checked the way users
 * run it: the bundled Electron, and native modules loaded from the unpacked asar. Run it after `npm run package:*`;
 * on Linux CI wrap it in xvfb-run.
 */
import { spawn } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const TIMEOUT_MS = 120_000
const dist = path.resolve('dist')

/** Entries of `dir`, or none when it does not exist. */
function entries(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/** The packaged executable for this platform, or null when there is no unpacked build. */
function findExecutable() {
  if (process.platform === 'win32') {
    const dir = path.join(dist, 'win-unpacked')
    const exe = entries(dir).find((name) => name.endsWith('.exe'))
    return exe ? path.join(dir, exe) : null
  }
  if (process.platform === 'darwin') {
    for (const folder of entries(dist).filter((name) => name.startsWith('mac'))) {
      const app = entries(path.join(dist, folder)).find((name) => name.endsWith('.app'))
      if (!app) continue
      const macos = path.join(dist, folder, app, 'Contents', 'MacOS')
      const exe = entries(macos)[0]
      if (exe) return path.join(macos, exe)
    }
    return null
  }
  const dir = path.join(dist, 'linux-unpacked')
  const exe = entries(dir).find((name) => {
    if (name.startsWith('chrome') || /\.so(\.|$)/.test(name)) return false
    const stat = statSync(path.join(dir, name))
    return stat.isFile() && (stat.mode & 0o111) !== 0
  })
  return exe ? path.join(dir, exe) : null
}

const exe = findExecutable()
if (!exe) {
  console.error(
    `No packaged app for ${process.platform} in ${dist}; run npm run package first.`
  )
  process.exit(1)
}

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const args = ['--smoke-test', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])]
console.log(`Smoke-testing ${exe}`)
const child = spawn(exe, args, { env, stdio: 'inherit' })
const timer = setTimeout(() => {
  console.error(`The packaged app did not exit within ${TIMEOUT_MS / 1000} s`)
  child.kill()
  process.exit(1)
}, TIMEOUT_MS)
child.on('error', (err) => {
  clearTimeout(timer)
  console.error(`Could not launch ${exe}: ${err.message}`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  clearTimeout(timer)
  if (code !== 0) console.error(`The packaged app exited with ${signal ?? code}`)
  process.exit(code ?? 1)
})
