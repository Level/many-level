'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const concat = require('concat-stream')
const { ManyLevelHost, ManyLevelGuest } = require('..')

tape('sublevel on deferred many-level guest', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()
  const sub1 = guest.sublevel('test', { valueEncoding: 'json' })
  const sub2 = guest.sublevel('test')

  t.is(guest.status, 'opening')
  stream.pipe(guest.createRpcStream()).pipe(stream)

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

tape('sublevel on non-deferred many-level guest', function (t) {
  t.plan(5)

  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.once('open', function () {
    t.is(guest.status, 'open')

    const sub1 = guest.sublevel('test', { valueEncoding: 'json' })
    const sub2 = guest.sublevel('test')

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

tape('many-level host on deferred sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = db.sublevel('test2')
  const stream = new ManyLevelHost(sub1).createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('from', 'guest', function (err) {
    t.error(err, 'no err')

    sub2.put('from', 'host', function (err) {
      t.error(err, 'no err')

      // TODO: use iterator.all() instead
      new EntryStream(guest).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'from', value: 'guest' }])
      }))

      new EntryStream(db).pipe(concat(function (entries) {
        t.same(entries, [
          { key: '!test1!from', value: 'guest' },
          { key: '!test2!from', value: 'host' }
        ])
      }))
    })
  })
})

tape('many-level host on non-deferred sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = db.sublevel('test2')

  sub1.once('open', function () {
    const stream = new ManyLevelHost(sub1).createRpcStream()
    const guest = new ManyLevelGuest()

    stream.pipe(guest.createRpcStream()).pipe(stream)

    guest.put('from', 'guest', function (err) {
      t.error(err, 'no err')

      sub2.put('from', 'host', function (err) {
        t.error(err, 'no err')

        // TODO: use iterator.all() instead
        new EntryStream(guest).pipe(concat(function (entries) {
          t.same(entries, [{ key: 'from', value: 'guest' }])
        }))

        new EntryStream(db).pipe(concat(function (entries) {
          t.same(entries, [
            { key: '!test1!from', value: 'guest' },
            { key: '!test2!from', value: 'host' }
          ])
        }))
      })
    })
  })
})

tape('many-level host on nested sublevel', function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const sub1 = db.sublevel('test1')
  const sub2 = sub1.sublevel('test2')
  const sub3 = db.sublevel('test3')
  const stream = new ManyLevelHost(sub2).createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  guest.put('from', 'guest', function (err) {
    t.error(err, 'no err')

    sub3.put('from', 'host', function (err) {
      t.error(err, 'no err')

      // TODO: use iterator.all() instead
      new EntryStream(guest).pipe(concat(function (entries) {
        t.same(entries, [{ key: 'from', value: 'guest' }])
      }))

      new EntryStream(db).pipe(concat(function (entries) {
        t.same(entries, [
          { key: '!test1!!test2!from', value: 'guest' },
          { key: '!test3!from', value: 'host' }
        ])
      }))
    })
  })
})
