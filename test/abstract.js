'use strict'

const test = require('tape')
const { MemoryLevel } = require('memory-level')
const multileveldown = require('..')
const suite = require('abstract-level/test')

suite({
  test,
  factory (options) {
    // Note, encoding options are set by server per operation
    const db = new MemoryLevel()

    // Temporary solution to allow test suite to reopen a db
    const remote = () => multileveldown.server(db)

    return multileveldown.client({ ...options, _remote: remote })
  }
})
