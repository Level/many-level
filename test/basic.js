'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const { pipeline } = require('readable-stream')
const concat = require('concat-stream')
const { ManyLevelHost, ManyLevelGuest } = require('..')

tape('get', function (t) {
  t.plan(7)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  db.put('hello', 'world', function (err) {
    t.error(err, 'no err')

    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
    })

    guest.get(Buffer.from('hello'), function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
    })

    guest.get('hello', { valueEncoding: 'buffer' }, function (err, value) {
      t.error(err, 'no err')
      t.same(value, Buffer.from('world'))
    })
  })
})

tape('get with valueEncoding: json in constructor', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest({ valueEncoding: 'json' })

  stream.pipe(guest.createRpcStream()).pipe(stream)

  db.put('hello', '{"foo":"world"}', function () {
    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
      t.end()
    })
  })
})

tape('get with valueEncoding: json in get options', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  db.put('hello', '{"foo":"world"}', function (err) {
    t.error(err, 'no err')

    guest.get('hello', { valueEncoding: 'json' }, function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
    })

    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })
  })
})

tape('put', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('hello', 'world', function (err) {
    t.error(err, 'no err')
    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
      t.end()
    })
  })
})

tape('put with valueEncoding: json in constructor', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest({ valueEncoding: 'json' })

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('hello', { foo: 'world' }, function (err) {
    t.error(err, 'no err')

    db.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })

    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, { foo: 'world' })
    })
  })
})

tape('put with valueEncoding: json in put options', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('hello', { foo: 'world' }, { valueEncoding: 'json' }, function (err) {
    t.error(err, 'no err')

    db.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })

    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, '{"foo":"world"}')
    })
  })
})

tape('readonly', async function (t) {
  t.plan(2)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db, { readonly: true })
  await db.put('hello', 'verden')

  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  try {
    await guest.put('hello', 'world')
  } catch (err) {
    t.is(err && err.code, 'LEVEL_READONLY')
  }

  t.is(await guest.get('hello'), 'verden', 'old value')
})

tape('del', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('hello', 'world', function (err) {
    t.error(err, 'no err')
    guest.del('hello', function (err) {
      t.error(err, 'no err')
      guest.get('hello', function (err) {
        t.is(err && err.code, 'LEVEL_NOT_FOUND')
        t.end()
      })
    })
  })
})

tape('batch', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    guest.get('hello', function (err, value) {
      t.error(err, 'no err')
      t.same(value, 'world')
      guest.get('hej', function (err, value) {
        t.error(err, 'no err')
        t.same(value, 'verden')
        t.end()
      })
    })
  })
})

tape('read stream', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    const rs = new EntryStream(guest)
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
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }], function (err) {
    t.error(err, 'no err')
    const rs = new EntryStream(guest, { gt: 'hej' })
    rs.pipe(concat(function (entries) {
      t.same(entries.length, 1)
      t.same(entries[0], { key: 'hello', value: 'world' })
      t.end()
    }))
  })
})

tape('for await...of iterator', async function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  await guest.batch([{ type: 'put', key: 'hello', value: 'world' }, { type: 'put', key: 'hej', value: 'verden' }])
  const entries = []

  for await (const [key, value] of guest.iterator()) {
    entries.push([key, value])
  }

  t.same(entries, [['hej', 'verden'], ['hello', 'world']])
})

tape('close with pending request', function (t) {
  t.plan(2)

  const guest = new ManyLevelGuest()

  guest.put('hello', 'world', function (err) {
    t.is(err && err.code, 'LEVEL_DATABASE_NOT_OPEN')

    guest.put('hello', 'world', function (err) {
      t.is(err && err.code, 'LEVEL_DATABASE_NOT_OPEN')
    })
  })

  guest.close()
})

tape('disconnect with pending request', function (t) {
  t.plan(3)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest({ retry: false })

  pipeline(stream, guest.createRpcStream(), stream, () => {})

  db.open(function (err) {
    t.ifError(err)

    guest.open(function (err) {
      t.ifError(err)

      guest.put('hello', 'world', function (err) {
        t.is(err && err.code, 'LEVEL_CONNECTION_LOST')

        // TODO: what are we expecting here?
        // guest.put('hello', 'world', function (err) {
        //   t.is(err && err.code, ?)
        // })
      })

      stream.destroy()
    })
  })
})

tape('close with pending iterator', function (t) {
  t.plan(3)

  const guest = new ManyLevelGuest()

  guest.open(function (err) {
    t.ifError(err)

    const it = guest.iterator()

    it.next(function (err) {
      t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN')

      it.next(function (err) {
        t.is(err && err.code, 'LEVEL_ITERATOR_NOT_OPEN')
      })
    })

    guest.close()
  })
})

tape('disconnect with pending iterator', function (t) {
  t.plan(3)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest({ retry: false })

  pipeline(stream, guest.createRpcStream(), stream, () => {})

  db.open(function (err) {
    t.ifError(err)

    guest.open(function (err) {
      t.ifError(err)

      guest.iterator().next(function (err) {
        t.is(err && err.code, 'LEVEL_CONNECTION_LOST')

        // TODO: what are we expecting here?
        // guest.iterator().next(function (err) {
        //   t.is(err && err.code, ?)
        // })
      })

      stream.destroy()
    })
  })
})
