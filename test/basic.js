'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const { pipeline } = require('readable-stream')
const concat = require('concat-stream')
const manylevel = require('../')

tape('get', function (t) {
  t.plan(7)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  db.put('hello', 'world', function (err) {
    t.error(err, 'no err')

    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
    })

    client.get(Buffer.from('hello'), function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
    })

    client.get('hello', { valueEncoding: 'buffer' }, function (err, value) {
      t.error(err, 'no err')
      t.same(value, Buffer.from('world'))
    })
  })
})

tape('get with valueEncoding: json in constructor', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ valueEncoding: 'json' })

  stream.pipe(client.connect()).pipe(stream)

  db.put('hello', '{"foo":"world"}', function () {
    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
      t.end()
    })
  })
})

tape('get with valueEncoding: json in get options', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  db.put('hello', '{"foo":"world"}', function (err) {
    t.error(err, 'no err')

    client.get('hello', { valueEncoding: 'json' }, function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
    })

    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })
  })
})

tape('put', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.put('hello', 'world', function (err) {
    t.error(err, 'no err')
    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
      t.end()
    })
  })
})

tape('put with valueEncoding: json in constructor', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ valueEncoding: 'json' })

  stream.pipe(client.connect()).pipe(stream)

  client.put('hello', { foo: 'world' }, function (err) {
    t.error(err, 'no err')

    db.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })

    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
    })
  })
})

tape('put with valueEncoding: json in put options', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.put('hello', { foo: 'world' }, { valueEncoding: 'json' }, function (err) {
    t.error(err, 'no err')

    db.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })

    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })
  })
})

tape('readonly', async function (t) {
  t.plan(2)

  const db = new MemoryLevel()
  await db.put('hello', 'verden')

  const stream = manylevel.server(db, { readonly: true })
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  try {
    await client.put('hello', 'world')
  } catch (err) {
    t.is(err && err.code, 'LEVEL_READONLY')
  }

  t.is(await client.get('hello'), 'verden', 'old value')
})

tape('del', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.put('hello', 'world', function (err) {
    t.error(err, 'no err')
    client.del('hello', function (err) {
      t.error(err, 'no err')
      client.get('hello', function (err) {
        t.is(err && err.code, 'LEVEL_NOT_FOUND')
        t.end()
      })
    })
  })
})

tape('batch', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    client.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
      client.get('hej', function (err, value) {
        t.error(err, 'no err')
        t.same(value, 'verden')
        t.end()
      })
    })
  })
})

tape('read stream', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    const rs = new EntryStream(client)
    rs.pipe(concat(function (entries) {
      t.same(entries.length, 2)
      t.same(entries[0], { key: 'hej', value: 'verden' })
      t.same(entries[1], { key: 'hello', value: 'world' })
      t.end()
    }))
  })
})

tape('read stream (gt)', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    const rs = new EntryStream(client, { gt: 'hej' })
    rs.pipe(concat(function (entries) {
      t.same(entries.length, 1)
      t.same(entries[0], { key: 'hello', value: 'world' })
      t.end()
    }))
  })
})

tape('for await...of iterator', function (t) {
  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], async function (err) {
    t.error(err, 'no err')

    const entries = []

    for await (const [key, value] of client.iterator()) {
      entries.push([key, value])
    }

    t.same(entries, [['hej', 'verden'], ['hello', 'world']])
    t.end()
  })
})

tape('close with pending request', function (t) {
  t.plan(2)

  const client = manylevel.client()

  client.put('hello', 'world', function (err) {
    t.is(err && err.code, 'LEVEL_DATABASE_NOT_OPEN')

    client.put('hello', 'world', function (err) {
      t.is(err && err.code, 'LEVEL_DATABASE_NOT_OPEN')
    })
  })

  client.close()
})

tape('disconnect with pending request', function (t) {
  t.plan(3)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ retry: false })

  pipeline(stream, client.connect(), stream, () => {})

  db.open(function (err) {
    t.ifError(err)

    client.open(function (err) {
      t.ifError(err)

      client.put('hello', 'world', function (err) {
        t.is(err && err.code, 'LEVEL_CONNECTION_LOST')

        // TODO: what are we expecting here?
        // client.put('hello', 'world', function (err) {
        //   t.is(err && err.code, ?)
        // })
      })

      stream.destroy()
    })
  })
})

tape('close with pending iterator', function (t) {
  t.plan(3)

  const client = manylevel.client()

  client.open(function (err) {
    t.ifError(err)

    const it = client.iterator()

    it.next(function (err) {
      t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN')

      it.next(function (err) {
        t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      })
    })

    client.close()
  })
})

tape('disconnect with pending iterator', function (t) {
  t.plan(3)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client({ retry: false })

  pipeline(stream, client.connect(), stream, () => {})

  db.open(function (err) {
    t.ifError(err)

    client.open(function (err) {
      t.ifError(err)

      client.iterator().next(function (err) {
        t.is(err && err.code, 'LEVEL_CONNECTION_LOST')

        // TODO: what are we expecting here?
        // client.iterator().next(function (err) {
        //   t.is(err && err.code, ?)
        // })
      })

      stream.destroy()
    })
  })
})
