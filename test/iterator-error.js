'use strict'

const test = require('tape')
const { MemoryLevel } = require('memory-level')
const { pipeline } = require('readable-stream')
const { ManyLevelHost, ManyLevelGuest } = require('../')
const ModuleError = require('module-error')

test('iterator.next() error', async function (t) {
  t.plan(4)

  const db = new MemoryLevel()
  const guest = new ManyLevelGuest()
  const host = new ManyLevelHost(db)
  const remote = host.createRpcStream(db)

  pipeline(remote, guest.createRpcStream(), remote, () => {})

  // Not testing deferredOpen
  await guest.open()

  const original = db._iterator
  let first = true

  db._iterator = function (options) {
    const it = original.call(this, options)

    it._nextv = function (size, options, cb) {
      this.nextTick(cb, first ? new Error('foo') : new ModuleError('bar', { code: 'LEVEL_XYZ' }))
      first = false
    }

    return it
  }

  try {
    await guest.iterator().next()
  } catch (err) {
    t.is(err.message, 'Could not read entry', 'Did not expose message')
    t.is(err.code, 'LEVEL_REMOTE_ERROR', 'Generic code')
  }

  try {
    await guest.iterator().next()
  } catch (err) {
    t.is(err.message, 'Could not read entry', 'Did not expose message')
    t.is(err.code, 'LEVEL_XYZ', 'Specific code')
  }
})
