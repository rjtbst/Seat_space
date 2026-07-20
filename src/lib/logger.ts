// src/lib/logger.ts
// Simple structured logger for server-side use.
// In development: human-readable console output.
// In production: JSON lines (compatible with Vercel / Datadog / CloudWatch).

const isProd = process.env.NODE_ENV === 'production'

function now() {
  return new Date().toISOString()
}

export function log(fn: string, msg: string, extra?: Record<string, unknown>) {
  if (isProd) {
    console.log(JSON.stringify({ ts: now(), fn, msg, ...extra }))
  } else {
    const extras = extra ? ` ${JSON.stringify(extra)}` : ''
    console.log(`\x1b[36m[${fn}]\x1b[0m ${msg}${extras}`)
  }
}

export function logWarn(fn: string, msg: string, extra?: Record<string, unknown>) {
  if (isProd) {
    console.warn(JSON.stringify({ ts: now(), level: 'WARN', fn, msg, ...extra }))
  } else {
    const extras = extra ? ` ${JSON.stringify(extra)}` : ''
    console.warn(`\x1b[33m[WARN][${fn}]\x1b[0m ${msg}${extras}`)
  }
}

export function logError(fn: string, msg: string, error: unknown) {
  const err =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) }
  if (isProd) {
    console.error(JSON.stringify({ ts: now(), level: 'ERROR', fn, msg, ...err }))
  } else {
    console.error(`\x1b[31m[ERROR][${fn}]\x1b[0m ${msg}`, err)
  }
}

/**
 * Times an async operation and logs a SLOW warning if it exceeds `warnMs` (default 300ms).
 * Also logs any thrown errors before re-throwing.
 */
export async function timed<T>(
  fn: string,
  label: string,
  cb: () => Promise<T>,
  warnMs = 300,
): Promise<T> {
  const start = Date.now()
  try {
    const result = await cb()
    const ms = Date.now() - start
    if (ms > warnMs) {
      logWarn(fn, `SLOW — ${label} took ${ms}ms`, { ms, label })
    } else {
      log(fn, `${label} — ${ms}ms`, { ms })
    }
    return result
  } catch (e) {
    const ms = Date.now() - start
    logError(fn, `${label} FAILED after ${ms}ms`, e)
    throw e
  }
}