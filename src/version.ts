import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolvePackageVersion(importMetaUrl: string): string {
  const startDir = path.dirname(fileURLToPath(importMetaUrl))
  let dir = startDir

  for (let i = 0; i < 10; i += 1) {
    const candidate = path.join(dir, 'package.json')
    try {
      const raw = fs.readFileSync(candidate, 'utf8')
      const json = JSON.parse(raw) as { version?: unknown } | null
      if (json && typeof json.version === 'string' && json.version.trim().length > 0) {
        return json.version.trim()
      }
    } catch {
      // ignore
    }

    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return '0.0.0'
}

