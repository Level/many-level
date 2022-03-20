'use strict'

const test = require('tape')
const { MemoryLevel } = require('memory-level')
const { ManyLevelHost, ManyLevelGuest } = require('..')
const suite = require('abstract-level/test')

suite({
  test,
  factory (options) {
    // Note, encoding options are set by host per operation
    const db = new MemoryLevel()
    const host = new ManyLevelHost(db)

    // Temporary solution to allow test suite to reopen a db
    const remote = () => host.createRpcStream()

    return new ManyLevelGuest({ ...options, _remote: remote })
  }
})
