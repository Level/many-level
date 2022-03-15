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

tape('retry iterator with gte option', async function (t) {
  t.plan(3)

  const db = new MemoryLevel()
  const entryCount = 1e4
  const padding = 5
  const client = manylevel.client({
    retry: true
  })

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

  const entries = await client.iterator({ gte: '1'.padStart(padding, '0') }).all()
  done = true

  t.is(entries.length, entryCount - 1)
  t.ok(entries.every((e, index) => parseInt(e[0], 10) === index + 1))
  t.ok(attempts > 1, `reconnected ${attempts} times`)
})

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
