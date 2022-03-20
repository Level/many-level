'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const concat = require('concat-stream')
const { ManyLevelHost, ManyLevelGuest } = require('..')

tape('two concurrent iterators', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream(db)
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  const batch = []
  for (let i = 0; i < 100; i++) batch.push({ type: 'put', key: 'key-' + i, value: 'value-' + i })

  guest.batch(batch, function (err) {
    t.error(err)

    // TODO: use iterator.all() instead
    const rs1 = new EntryStream(guest)
    const rs2 = new EntryStream(guest)

    rs1.pipe(concat(function (list1) {
      t.same(list1.length, 100)
      rs2.pipe(concat(function (list2) {
        t.same(list2.length, 100)
        t.end()
      }))
    }))
  })
})
