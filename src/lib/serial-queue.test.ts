import { describe, it, expect } from 'vitest'
import { createSerialQueue } from './serial-queue'

const deferred = () => {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('createSerialQueue', () => {
  it('does not start a task until the previous one has settled', async () => {
    const q = createSerialQueue()
    const gate = deferred()
    const order: string[] = []

    const first = q.run(async () => { order.push('first:start'); await gate.promise; order.push('first:end') })
    const second = q.run(async () => { order.push('second') })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])

    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('keeps running after a task rejects, and still rejects that task to its caller', async () => {
    const q = createSerialQueue()
    const order: string[] = []

    const failed = q.run(async () => { order.push('failed'); throw new Error('nope') })
    const after = q.run(async () => { order.push('after') })

    await expect(failed).rejects.toThrow('nope')
    await after
    expect(order).toEqual(['failed', 'after'])
  })

  it('hands a task its own result', async () => {
    const q = createSerialQueue()
    expect(await q.run(async () => 42)).toBe(42)
  })

  it('preserves the order tasks were handed in', async () => {
    const q = createSerialQueue()
    const order: number[] = []
    // Descending delays: without the queue these would finish 3, 2, 1.
    await Promise.all([3, 2, 1].map((n, i) =>
      q.run(async () => {
        await new Promise(r => setTimeout(r, n * 10))
        order.push(i)
      }),
    ))
    expect(order).toEqual([0, 1, 2])
  })

  it('idle resolves once the work outstanding at the time has settled', async () => {
    const q = createSerialQueue()
    const gate = deferred()
    let done = false

    void q.run(async () => { await gate.promise; done = true })
    const drained = q.idle().then(() => done)

    gate.resolve()
    expect(await drained).toBe(true)
  })

  it('idle survives a rejected task', async () => {
    const q = createSerialQueue()
    void q.run(async () => { throw new Error('nope') }).catch(() => undefined)
    await expect(q.idle()).resolves.toBeUndefined()
  })
})
