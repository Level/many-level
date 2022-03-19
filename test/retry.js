'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const { pipeline } = require('readable-stream')
const manylevel = require('../')

tape('retry get', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ retry: true })

  db.put('hello', 'world', function () {
    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
      t.end()
    })

    stream.pipe(client.connect()).pipe(stream)
  })
})

tape('no retry get', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ retry: false })

  client.open(function () {
    db.put('hello', 'world', function () {
      client.get('hello', function (err, value) {
        t.ok(err, 'had error')
        t.end()
      })

      const rpc = client.connect()
      stream.pipe(rpc).pipe(stream)
      rpc.destroy()

      setTimeout(function () {
        const rpc = client.connect()
        stream.pipe(rpc).pipe(stream)
      }, 100)
    })
  })
})

tape('retry get', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ retry: true })

  client.open(function () {
    db.put('hello', 'world', function () {
      client.get('hello', function (err, value) {
        t.error(err, 'no err')
        t.same(value, 'world')
        t.end()
      })

      const rpc = client.connect()
      stream.pipe(rpc).pipe(stream)
      rpc.destroy()

      setTimeout(function () {
        const rpc = client.connect()
        stream.pipe(rpc).pipe(stream)
      }, 100)
    })
  })
})

for (const reverse of [false, true]) {
  tape(`retry iterator with gte (reverse: ${reverse})`, async function (t) {
    const db = new MemoryLevel()
    const entryCount = 1e4
    const padding = 5
    const client = manylevel.client({ retry: true })

    let done = false
    let attempts = 0
    let n = 0

    await db.batch(new Array(entryCount).fill(null).map((_, i) => {
      return { type: 'put', key: String(i).padStart(padding, '0'), value: String(i) }
    }))

    // Don't test deferredOpen
    await client.open()

    // Artificially slow down iterators
    const original = db._iterator
    db._iterator = function (options) {
      const it = original.call(this, options)
      const nextv = it._nextv

      it._nextv = function (size, options, cb) {
        if (n++ > entryCount * 10) throw new Error('Infinite loop')

        nextv.call(this, size, options, (...args) => {
          setTimeout(cb.bind(null, ...args), 10)
        })
      }

      return it
    }

    // (Re)connect every 50ms
    ;(function connect () {
      if (done) return

      attempts++

      const remote = manylevel.server(db)
      const local = client.connect()

      // TODO: calls back too soon if you destroy remote instead of local,
      // because duplexify does not satisfy node's willEmitClose() check
      pipeline(remote, local, remote, connect)
      setTimeout(local.destroy.bind(local), 50)
    })()

    const entries = await client.iterator({ gte: '1'.padStart(padding, '0'), reverse }).all()
    done = true

    t.is(entries.length, entryCount - 1)
    if (reverse) entries.reverse()
    t.ok(entries.every((e, index) => parseInt(e[0], 10) === index + 1))
    t.ok(attempts > 1, `reconnected ${attempts} times`)
  })
}

for (const reverse of [false, true]) {
  tape(`retry iterator with bytes (reverse: ${reverse})`, async function (t) {
    const db = new MemoryLevel()
    const client = manylevel.client({
      retry: true,
      keyEncoding: 'buffer'
    })

    let done = false
    let attempts = 0
    let local

    const keys = [
      Buffer.alloc(0),
      Buffer.from([0]),
      Buffer.from([1]),
      Buffer.from([1, 0]),
      Buffer.from([1, 0, 0]),
      Buffer.from([1, 0, 254]),
      Buffer.from([1, 0, 255]),
      Buffer.from([1, 1, 0]),
      Buffer.from([255]),
      Buffer.from([255, 0]),
      Buffer.from([255, 255])
    ]

    await db.batch(keys.map((key, i) => {
      return { type: 'put', key, value: String(i) }
    }))

    // Don't test deferredOpen
    await client.open()

    ;(function connect () {
      if (done) return
      attempts++
      const remote = manylevel.server(db)
      local = client.connect()
      pipeline(remote, local, remote, connect)
    })()

    // Wait for first connection
    await client.get(Buffer.alloc(0))

    const result = []
    const it = client.keys({ reverse })

    while (true) {
      local.destroy()
      local = null
      const key = await it.next()
      if (key === undefined) break
      result.push(key)
    }

    done = true
    await it.close()

    t.same(result, reverse ? keys.reverse() : keys)
    t.ok(attempts > 1, `reconnected ${attempts} times`)
  })
}

tape('retry value iterator', async function (t) {
  const db = new MemoryLevel()
  const client = manylevel.client({ retry: true, valueEncoding: 'json' })
  const keys = ['a', 'b', 'c', 'd']

  let done = false
  let attempts = 0
  let local

  await db.batch(keys.map((key, value) => {
    return { type: 'put', key, value }
  }))

  ;(function connect () {
    if (done) return
    attempts++
    const remote = manylevel.server(db)
    local = client.connect()
    pipeline(remote, local, remote, connect)
  })()

  // Wait for first connection
  await client.get('a')

  const result = []
  const it = client.values()

  while (true) {
    local.destroy()
    local = null
    const value = await it.next()
    if (value === undefined) break
    result.push(value)
  }

  done = true
  await it.close()

  t.same(result, [0, 1, 2, 3])
  t.ok(attempts > 1, `reconnected ${attempts} times`)
})

for (const reverse of [false, true]) {
  tape(`retry iterator with a seek() that skips keys (reverse: ${reverse})`, async function (t) {
    const db = new MemoryLevel()
    const client = manylevel.client({ retry: true })

    let done = false
    let attempts = 0
    let local

    await db.batch(new Array(10).fill(null).map((_, i) => {
      return { type: 'put', key: String(i).padStart(2, '0'), value: 'a' }
    }))

    // Don't test deferredOpen
    await client.open()

    ;(function connect () {
      if (done) return
      attempts++
      const remote = manylevel.server(db)
      local = client.connect()
      pipeline(remote, local, remote, connect)
    })()

    const result = []
    const it = client.keys({ reverse })

    while (true) {
      let key = await it.next()
      if (key === undefined) break
      key = parseInt(key)
      result.push(key)
      it.seek(String(key + (reverse ? -2 : 2)).padStart(2, '0'))
      if (local) local.destroy()
      local = null
    }

    done = true
    await it.close()

    t.same(result, reverse ? [9, 7, 5, 3, 1] : [0, 2, 4, 6, 8])
    t.ok(attempts > 1, `reconnected ${attempts} times`)
  })
}

for (const reverse of [false, true]) {
  tape(`retry iterator with a seek() that revisits keys (reverse: ${reverse})`, async function (t) {
    const db = new MemoryLevel()
    const client = manylevel.client({ retry: true })

    let done = false
    let attempts = 0
    let local
    let revisited = false

    await db.batch(new Array(10).fill(null).map((_, i) => {
      return { type: 'put', key: String(i), value: String(i) }
    }))

    // Don't test deferredOpen
    await client.open()

    ;(function connect () {
      if (done) return
      attempts++
      const remote = manylevel.server(db)
      local = client.connect()
      pipeline(remote, local, remote, connect)
    })()

    const result = []
    const it = client.keys({ reverse })

    while (true) {
      let key = await it.next()
      if (key === undefined) break

      key = parseInt(key)
      result.push(key)

      if (!revisited) {
        if (reverse ? key === 5 : key === 4) {
          revisited = true
          it.seek(String(reverse ? 9 : 0))
        }
      }

      // Keep disconnecting to test that host only seeks once
      if (local) local.destroy()
      local = null
    }

    done = true
    await it.close()

    t.same(result, reverse
      ? [9, 8, 7, 6, 5, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
      : [0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    )
    t.ok(attempts > 1, `reconnected ${attempts} times`)
  })
}

tape('retry read stream', function (t) {
  const db = new MemoryLevel()
  const client = manylevel.client({ retry: true })

  client.open(function () {
    db.batch([{
      type: 'put',
      key: 'hej',
      value: 'verden'
    }, {
      type: 'put',
      key: 'hello',
      value: 'world'
    }, {
      type: 'put',
      key: 'hola',
      value: 'mundo'
    }], function () {
      const rs = new EntryStream(client)
      const expected = [{
        key: 'hej',
        value: 'verden'
      }, {
        key: 'hello',
        value: 'world'
      }, {
        key: 'hola',
        value: 'mundo'
      }]

      rs.on('data', function (data) {
        t.same(data, expected.shift(), 'stream continues over retry')
      })

      rs.on('end', function () {
        t.same(expected.length, 0, 'no more data')
        t.end()
      })

      let stream
      let clientStream

      const connect = function () {
        stream = manylevel.server(db)
        clientStream = client.connect()
        stream.pipe(clientStream).pipe(stream)
      }

      connect()
    })
  })
})

tape('retry read stream and limit', function (t) {
  const db = new MemoryLevel()
  const client = manylevel.client({ retry: true })

  client.open(function () {
    db.batch([{
      type: 'put',
      key: 'hej',
      value: 'verden'
    }, {
      type: 'put',
      key: 'hello',
      value: 'world'
    }, {
      type: 'put',
      key: 'hola',
      value: 'mundo'
    }], function () {
      const rs = new EntryStream(client, { limit: 2 })
      const expected = [{
        key: 'hej',
        value: 'verden'
      }, {
        key: 'hello',
        value: 'world'
      }]

      rs.on('data', function (data) {
        t.same(data, expected.shift(), 'stream continues over retry')
      })

      rs.on('end', function () {
        t.same(expected.length, 0, 'no more data')
        t.end()
      })

      let stream
      let clientStream

      const connect = function () {
        stream = manylevel.server(db)
        clientStream = client.connect()
        stream.pipe(clientStream).pipe(stream)
      }

      connect()
    })
  })
})
