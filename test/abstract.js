'use strict'

const test = require('tape')
const { MemoryLevel } = require('memory-level')
const manylevel = require('..')
const suite = require('abstract-level/test')

suite({
  test,
  factory (options) {
    // Note, encoding options are set by server per operation
    const db = new MemoryLevel()

    // Temporary solution to allow test suite to reopen a db
    const remote = () => manylevel.server(db)

    return manylevel.client({ ...options, _remote: remote })
  }
})
