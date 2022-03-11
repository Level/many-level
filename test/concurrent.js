'use strict'

const tape = require('tape')
const { MemoryLevel } = require('memory-level')
const { EntryStream } = require('level-read-stream')
const concat = require('concat-stream')
const multileveldown = require('../')

tape('two concurrent iterators', function (t) {
  const db = new MemoryLevel()
  const server = multileveldown.server(db)
  const client = multileveldown.client()

  server.pipe(client.connect()).pipe(server)

  const batch = []
  for (let i = 0; i < 100; i++) batch.push({ type: 'put', key: 'key-' + i, value: 'value-' + i })

  client.batch(batch, function (err) {
    t.error(err)

    const rs1 = new EntryStream(client)
    const rs2 = new EntryStream(client)

    rs1.pipe(concat(function (list1) {
      t.same(list1.length, 100)
      rs2.pipe(concat(function (list2) {
        t.same(list2.length, 100)
        t.end()
      }))
    }))
  })
})

tape('two concurrent clients', function (t) {
  const db = new MemoryLevel()
  const server1 = multileveldown.server(db)
  const server2 = multileveldown.server(db)
  const client1 = multileveldown.client()
  const client2 = multileveldown.client()

  server1.pipe(client1.connect()).pipe(server1)
  server2.pipe(client2.connect()).pipe(server2)

  const batch = []
  for (let i = 0; i < 100; i++) batch.push({ type: 'put', key: 'key-' + i, value: 'value-' + i })

  client1.batch(batch, function (err) {
    t.error(err)

    const rs1 = new EntryStream(client1)
    const rs2 = new EntryStream(client2)

    rs1.pipe(concat(function (list1) {
      t.same(list1.length, 100)
      rs2.pipe(concat(function (list2) {
        t.same(list2.length, 100)
        t.end()
      }))
    }))
  })
})
