#!/usr/bin/env node
import { runCli } from './run.js'

runCli(process.argv.slice(2), {
  env: process.env,
  fetch: globalThis.fetch.bind(globalThis),
  stdout: process.stdout,
  stderr: process.stderr,
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
