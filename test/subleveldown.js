'use strict'

// TODO: rename file

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const concat = require('concat-stream')
const manylevel = require('../')

tape('sublevel on deferred many-level client', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()
  const sub1 = client.sublevel('test', { valueEncoding: 'json' })
  const sub2 = client.sublevel('test')

  t.is(client.status, 'opening')
  stream.pipe(client.connect()).pipe(stream)

  sub1.put('hello', { test: 'world' }, function (err) {
    t.error(err, 'no err')

    // TODO: use iterator.all() instead
    new EntryStream(sub1).pipe(concat(function (entries) {
      t.same(entries, [{ key: 'hello', value: { test: 'world' } }])
    }))

    new EntryStream(sub2).pipe(concat(function (entries) {
      t.same(entries, [{ key: 'hello', value: '{"test":"world"}' }])
    }))

    new EntryStream(db).pipe(concat(function (entries) {
      t.same(entries, [{ key: '!test!hello', value: '{"test":"world"}' }])
    }))
  })
})

tape('sublevel on non-deferred many-level client', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const stream = manylevel.server(db)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.once('open', function () {
    t.is(client.status, 'open')

    const sub1 = client.sublevel('test', { valueEncoding: 'json' })
    const sub2 = client.sublevel('test')

    sub1.put('hello', { test: 'world' }, function (err) {
      t.error(err, 'no err')

      // TODO: use iterator.all() instead
      new EntryStream(sub1).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'hello', value: { test: 'world' } }])
      }))

      new EntryStream(sub2).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'hello', value: '{"test":"world"}' }])
      }))

      new EntryStream(db).pipe(concat(function (entries) {
        t.same(entries, [{ key: '!test!hello', value: '{"test":"world"}' }])
      }))
    })
  })
})

tape('many-level server on deferred sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = db.sublevel('test2')
  const stream = manylevel.server(sub1)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.put('from', 'client', function (err) {
    t.error(err, 'no err')

    sub2.put('from', 'server', function (err) {
      t.error(err, 'no err')

      // TODO: use iterator.all() instead
      new EntryStream(client).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'from', value: 'client' }])
      }))

      new EntryStream(db).pipe(concat(function (entries) {
        t.same(entries, [
          { key: '!test1!from', value: 'client' },
          { key: '!test2!from', value: 'server' }
        ])
      }))
    })
  })
})

tape('many-level server on non-deferred sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = db.sublevel('test2')

  sub1.once('open', function () {
    const stream = manylevel.server(sub1)
    const client = manylevel.client()

    stream.pipe(client.connect()).pipe(stream)

    client.put('from', 'client', function (err) {
      t.error(err, 'no err')

      sub2.put('from', 'server', function (err) {
        t.error(err, 'no err')

        // TODO: use iterator.all() instead
        new EntryStream(client).pipe(concat(function (entries) {
          t.same(entries, [{ key: 'from', value: 'client' }])
        }))

        new EntryStream(db).pipe(concat(function (entries) {
          t.same(entries, [
            { key: '!test1!from', value: 'client' },
            { key: '!test2!from', value: 'server' }
          ])
        }))
      })
    })
  })
})

tape('many-level server on nested sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = sub1.sublevel('test2')
  const sub3 = db.sublevel('test3')
  const stream = manylevel.server(sub2)
  const client = manylevel.client()

  stream.pipe(client.connect()).pipe(stream)

  client.put('from', 'client', function (err) {
    t.error(err, 'no err')

    sub3.put('from', 'server', function (err) {
      t.error(err, 'no err')

      // TODO: use iterator.all() instead
      new EntryStream(client).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'from', value: 'client' }])
      }))

      new EntryStream(db).pipe(concat(function (entries) {
        t.same(entries, [
          { key: '!test1!!test2!from', value: 'client' },
          { key: '!test3!from', value: 'server' }
        ])
      }))
    })
  })
})
