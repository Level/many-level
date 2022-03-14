'use strict'

const messages = require('./messages')

const INPUT = [
  messages.Get,
  messages.Put,
  messages.Delete,
  messages.Batch,
  messages.Iterator,
  messages.Clear,
  messages.GetMany,
  messages.IteratorClose
]

const OUTPUT = [
  messages.Callback,
  messages.IteratorData,
  messages.GetManyCallback,
  messages.IteratorError
]

exports.input = {
  get: 0,
  put: 1,
  del: 2,
  batch: 3,
  iterator: 4,
  clear: 5,
  getMany: 6,
  iteratorClose: 7,

  encoding (tag) {
    return INPUT[tag]
  }
}

exports.output = {
  callback: 0,
  iteratorData: 1,
  getManyCallback: 2,
  iteratorError: 3,

  encoding (tag) {
    return OUTPUT[tag]
  }
}
