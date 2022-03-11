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

    // TODO: use iterator.all() instead
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
