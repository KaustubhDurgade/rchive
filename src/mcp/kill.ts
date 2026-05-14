import { execSync } from 'child_process'

export function killServerOnPort(port: number): 'killed' | 'not-running' | 'error' {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim()
    if (!output) return 'not-running'
    for (const pidStr of output.split('\n')) {
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid)) process.kill(pid, 'SIGTERM')
    }
    return 'killed'
  } catch (err: unknown) {
    // lsof exits non-zero when no process found
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      return 'not-running'
    }
    return 'error'
  }
}
