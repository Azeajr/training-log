import { describe, it, expect } from 'vitest'
import { createTransactionRunner } from './transaction'

/**
 * A fake begin/commit/rollback that records the order it was called in, so a
 * test can see whether two callers got their own transaction or were folded
 * into one. `failBegin` models a BEGIN that rejects (F06).
 */
function fakeOps() {
  const log: string[] = []
  let failBegin = false
  const ops = {
    begin: async () => {
      if (failBegin) throw new Error('SQLITE_BUSY')
      log.push('begin')
    },
    commit: async () => { log.push('commit') },
    rollback: async () => { log.push('rollback') },
  }
  return {
    ops,
    log,
    setFailBegin: (v: boolean) => { failBegin = v },
    note: (s: string) => log.push(s),
    count: (s: string) => log.filter((l) => l === s).length,
  }
}

/** Let queued microtasks drain so an in-flight transaction reaches its await. */
const settle = () => new Promise<void>((r) => setTimeout(r, 0))

describe('createTransactionRunner', () => {
  it('commits a simple transaction', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)
    await run(async () => { f.note('work') })
    expect(f.log).toEqual(['begin', 'work', 'commit'])
  })

  it('rolls back and rethrows when the body fails', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)
    await expect(run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(f.log).toEqual(['begin', 'rollback'])
  })

  it('serializes two queued transactions in order', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)
    await Promise.all([
      run(async () => { f.note('a') }),
      run(async () => { f.note('b') }),
    ])
    expect(f.log).toEqual(['begin', 'a', 'commit', 'begin', 'b', 'commit'])
  })

  it('reports a nested transaction as a deadlock rather than hanging', async () => {
    // Nesting is no longer supported: `transaction()` is the only thing that
    // opens a transaction, and `bulkAdd` no longer does. If that invariant is
    // ever broken the nested call waits on a lock its own caller holds, so the
    // runner has to name the cause instead of hanging forever.
    const f = fakeOps()
    const run = createTransactionRunner(f.ops, { timeoutMs: 50 })
    await expect(
      run(async () => {
        await run(async () => { f.note('inner') })
      }),
    ).rejects.toThrow(/opened from inside another one/)
    expect(f.log).not.toContain('inner')
  })

  it('keeps serving later callers after one transaction fails', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)
    const failed = run(async () => { throw new Error('boom') }).catch((e: Error) => e.message)
    const after = run(async () => { f.note('after') })
    expect(await failed).toBe('boom')
    await after
    expect(f.log).toEqual(['begin', 'rollback', 'begin', 'after', 'commit'])
  })

  // ── F05 ───────────────────────────────────────────────────────────────────
  it('gives an independent concurrent caller its own transaction (F05)', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)

    // A opens a transaction and parks inside its body, the way any awaited
    // query does. B is a separate, unrelated caller that arrives meanwhile.
    let releaseA!: () => void
    const aParked = new Promise<void>((r) => { releaseA = r })
    const a = run(async () => { f.note('a:work'); await aParked })
    await settle()

    const b = run(async () => { f.note('b:work') })
    await settle()
    releaseA()
    await Promise.all([a, b])

    // Two independent callers means two transactions, not one shared one.
    expect(f.count('begin')).toBe(2)
    expect(f.count('commit')).toBe(2)
  })

  it("does not discard a committed transaction's writes when an unrelated one rolls back (F05)", async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)

    let releaseA!: () => void
    const aParked = new Promise<void>((r) => { releaseA = r })
    const a = run(async () => { await aParked; throw new Error('A failed') }).catch(
      (e: Error) => e.message,
    )
    await settle()

    // B is an unrelated caller that arrives while A is still open.
    const b = run(async () => { f.note('b:write') })
    await settle()
    // It must not have been folded into A's transaction: under the old depth
    // counter it ran here, inside A, and was lost by A's ROLLBACK below.
    expect(f.log).not.toContain('b:write')

    releaseA()
    expect(await a).toBe('A failed')
    await b

    // B got its own BEGIN/COMMIT after A rolled back, so A cannot discard it.
    expect(f.log).toEqual(['begin', 'rollback', 'begin', 'b:write', 'commit'])
  })

  // ── F06 ───────────────────────────────────────────────────────────────────
  it('stays usable after BEGIN rejects (F06)', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)

    f.setFailBegin(true)
    await expect(run(async () => { f.note('never') })).rejects.toThrow('SQLITE_BUSY')
    f.setFailBegin(false)

    // The next transaction is independent and must really open one.
    await run(async () => { f.note('later') })
    expect(f.log).toEqual(['begin', 'later', 'commit'])
  })

  it('does not leave a failed BEGIN holding the nesting state (F06)', async () => {
    const f = fakeOps()
    const run = createTransactionRunner(f.ops)

    f.setFailBegin(true)
    await expect(run(async () => {})).rejects.toThrow('SQLITE_BUSY')
    f.setFailBegin(false)

    // A body that throws must still roll back. If the failed BEGIN left the
    // runner believing a transaction is open, this one runs inline instead:
    // no BEGIN, no ROLLBACK, and the partial writes stay.
    await expect(run(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(f.log).toEqual(['begin', 'rollback'])
  })
})
