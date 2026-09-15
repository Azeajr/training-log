import { describe, it, expect, vi, afterEach } from 'vitest'
import { createWorkerRpc, type WorkerLike, type RpcResponse } from './rpc'

/**
 * A worker that answers only when told to, so a test can hold a call open,
 * crash the worker, or never reply at all.
 */
function fakeWorker() {
  const sent: Array<{ id: number; type: string }> = []
  let terminated = false
  const w: WorkerLike = {
    postMessage: (msg) => { sent.push(msg as { id: number; type: string }) },
    terminate: () => { terminated = true },
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  }
  return {
    worker: w,
    sent,
    isTerminated: () => terminated,
    reply: (r: RpcResponse) => w.onmessage?.({ data: r }),
    /** Answer the most recent message of this type. */
    replyTo: (type: string, result: unknown) => {
      const m = [...sent].reverse().find((s) => s.type === type)
      if (!m) throw new Error(`nothing sent of type ${type}`)
      w.onmessage?.({ data: { id: m.id, result } })
    },
    crash: (err: unknown) => w.onerror?.(err),
    badMessage: () => w.onmessageerror?.(new Error('structured clone failed')),
  }
}

afterEach(() => { vi.useRealTimers() })

describe('createWorkerRpc', () => {
  it('resolves ready with the init result', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    f.replyTo('init', { persistent: true })
    await expect(rpc.ready).resolves.toEqual({ persistent: true })
  })

  it('rejects ready when init reports an error', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    const m = f.sent[0]
    f.reply({ id: m.id, error: 'no such table' })
    await expect(rpc.ready).rejects.toThrow('no such table')
  })

  it('rejects pending calls on terminate', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    f.replyTo('init', { persistent: true })
    await rpc.ready
    const call = rpc.send('query', 'SELECT 1', [])
    await Promise.resolve()
    rpc.terminate()
    await expect(call).rejects.toThrow('SQLite worker terminated')
    expect(f.isTerminated()).toBe(true)
  })

  // ── F04 ───────────────────────────────────────────────────────────────────
  it('rejects ready when the worker fails to load (F04)', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    // A worker that 404s, violates CSP, or throws while evaluating fires
    // `error` and never answers a single message.
    f.crash(new Error('Failed to construct Worker'))
    await expect(rpc.ready).rejects.toThrow(/worker/i)
  })

  it('rejects in-flight calls when the worker dies mid-call (F04)', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    f.replyTo('init', { persistent: true })
    await rpc.ready
    const call = rpc.send('run', 'INSERT INTO lifts VALUES (1)', [])
    await Promise.resolve()
    f.crash(new Error('worker crashed'))
    await expect(call).rejects.toThrow(/worker/i)
  })

  it('rejects ready when init never answers (F04)', async () => {
    vi.useFakeTimers()
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker, { initTimeoutMs: 5_000 })
    const assertion = expect(rpc.ready).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it('rejects a call that arrives after the worker died, without hanging (F04)', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    f.replyTo('init', { persistent: true })
    await rpc.ready
    f.crash(new Error('worker crashed'))
    await expect(rpc.send('query', 'SELECT 1', [])).rejects.toThrow(/worker/i)
  })

  it('rejects ready when the worker cannot deserialize a message (F04)', async () => {
    const f = fakeWorker()
    const rpc = createWorkerRpc(f.worker)
    f.badMessage()
    await expect(rpc.ready).rejects.toThrow(/worker/i)
  })
})
