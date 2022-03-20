'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const concat = require('concat-stream')
const { ManyLevelHost, ManyLevelGuest } = require('..')

tape('two concurrent iterators', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream = host.createRpcStream()
  const guest = new ManyLevelGuest()

  stream.pipe(guest.createRpcStream()).pipe(stream)

  const batch = []

  for (let i = 0; i < 100; i++) {
    batch.push({ type: 'put', key: 'key-' + i, value: 'value-' + i })
  }

  guest.batch(batch, function (err) {
    t.error(err)

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

tape('two concurrent guests', function (t) {
  const db = new MemoryLevel()
  const host = new ManyLevelHost(db)
  const stream1 = host.createRpcStream()
  const stream2 = host.createRpcStream()
  const guest1 = new ManyLevelGuest()
  const guest2 = new ManyLevelGuest()

  stream1.pipe(guest1.createRpcStream()).pipe(stream1)
  stream2.pipe(guest2.createRpcStream()).pipe(stream2)

  const batch = []
  for (let i = 0; i < 100; i++) batch.push({ type: 'put', key: 'key-' + i, value: 'value-' + i })

  guest1.batch(batch, function (err) {
    t.error(err)

    const rs1 = new EntryStream(guest1)
    const rs2 = new EntryStream(guest2)

    rs1.pipe(concat(function (list1) {
      t.same(list1.length, 100)
      rs2.pipe(concat(function (list2) {
        t.same(list2.length, 100)
        t.end()
      }))
    }))
  })
})
