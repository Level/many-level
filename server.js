'use strict'

const lpstream = require('length-prefixed-stream')
const ModuleError = require('module-error')
const eos = require('end-of-stream')
const duplexify = require('duplexify')
const messages = require('./messages')

const rangeOptions = new Set(['gt', 'gte', 'lt', 'lte'])
const encodingOptions = Object.freeze({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
const kClosed = Symbol('closed')
const noop = () => {}

const DECODERS = [
  messages.Get,
  messages.Put,
  messages.Delete,
  messages.Batch,
  messages.Iterator,
  messages.Clear,
  messages.GetMany
]

module.exports = function (db, opts) {
  if (!opts) opts = {}

  const readonly = !!(opts.readonly)
  const decode = lpstream.decode()
  const encode = lpstream.encode()
  const stream = duplexify(decode, encode)

  const preput = opts.preput || function (key, val, cb) { cb(null) }
  const predel = opts.predel || function (key, cb) { cb(null) }
  const prebatch = opts.prebatch || function (ops, cb) { cb(null) }

  db.open({ passive: true }, ready)

  return stream

  // TODO: handle error
  function ready () {
    const iterators = new Map()

    eos(stream, function () {
      for (const iterator of iterators.values()) {
        iterator.close()
      }

      iterators.clear()
    })

    decode.on('data', function (data) {
      if (!data.length) return
      const tag = data[0]
      if (tag >= DECODERS.length) return

      const dec = DECODERS[tag]
      let req
      try {
        req = dec.decode(data, 1)
      } catch (err) {
        return
      }

      if (readonly) {
        switch (tag) {
          case 0: return onget(req)
          case 1: return onreadonly(req)
          case 2: return onreadonly(req)
          case 3: return onreadonly(req)
          case 4: return oniterator(req)
          case 5: return onreadonly(req)
          case 6: return ongetmany(req)
        }
      } else {
        switch (tag) {
          case 0: return onget(req)
          case 1: return onput(req)
          case 2: return ondel(req)
          case 3: return onbatch(req)
          case 4: return oniterator(req)
          case 5: return onclear(req)
          case 6: return ongetmany(req)
        }
      }
    })

    function callback (id, err, value) {
      const msg = { id, error: errorCode(err), value }
      const buf = Buffer.allocUnsafe(messages.Callback.encodingLength(msg) + 1)
      buf[0] = 0 // Tag
      messages.Callback.encode(msg, buf, 1)
      encode.write(buf)
    }

    function getManyCallback (id, err, values) {
      const msg = { id, error: errorCode(err), values }
      const buf = Buffer.allocUnsafe(messages.GetManyCallback.encodingLength(msg) + 1)
      buf[0] = 2 // Tag
      messages.GetManyCallback.encode(msg, buf, 1)
      encode.write(buf)
    }

    function onput (req) {
      preput(req.key, req.value, function (err) {
        if (err) return callback(err)
        db.put(req.key, req.value, encodingOptions, function (err) {
          callback(req.id, err, null)
        })
      })
    }

    function onget (req) {
      db.get(req.key, encodingOptions, function (err, value) {
        callback(req.id, err, value)
      })
    }

    function ongetmany (req) {
      db.getMany(req.keys, encodingOptions, function (err, values) {
        getManyCallback(req.id, err, values.map(value => ({ value })))
      })
    }

    function ondel (req) {
      predel(req.key, function (err) {
        if (err) return callback(err)
        db.del(req.key, encodingOptions, function (err) {
          callback(req.id, err)
        })
      })
    }

    function onreadonly (req) {
      callback(req.id, new ModuleError('Database is readonly', { code: 'LEVEL_READONLY' }))
    }

    function onbatch (req) {
      prebatch(req.ops, function (err) {
        if (err) return callback(err)

        db.batch(req.ops, encodingOptions, function (err) {
          callback(req.id, err)
        })
      })
    }

    function oniterator (req) {
      let prev = iterators.get(req.id)

      if (req.batch) {
        if (prev === undefined) {
          prev = new Iterator(db, req, encode)
          iterators.set(req.id, prev)
        }

        prev.batch = req.batch
        prev.next()
      } else {
        // If batch is not set, this is a close signal
        iterators.delete(req.id)
        if (prev !== undefined) prev.close()
      }
    }

    function onclear (req) {
      db.clear(cleanRangeOptions(req.options), function (err) {
        callback(req.id, err)
      })
    }
  }
}

function Iterator (db, req, encode) {
  this.batch = req.batch || 0
  this._iterator = db.iterator(cleanRangeOptions(req.options))
  this._encode = encode
  this._send = (err, key, value) => {
    // TODO: send key and value directly (sans protobuf) with
    // <tag><id><key length><key><value>, avoiding a copy
    this._nexting = false
    this._data.error = errorCode(err)
    this._data.key = key
    this._data.value = value
    this.batch--
    const buf = Buffer.allocUnsafe(messages.IteratorData.encodingLength(this._data) + 1)
    buf[0] = 1
    messages.IteratorData.encode(this._data, buf, 1)
    encode.write(buf)
    this.next()
  }
  this._nexting = false
  this._first = true
  this[kClosed] = false
  this._data = {
    id: req.id,
    error: null,
    key: null,
    value: null
  }
}

Iterator.prototype.next = function () {
  if (this._nexting || this[kClosed]) return
  if (!this._first && (!this.batch || this._data.error || (!this._data.key && !this._data.value))) return
  this._first = false
  this._nexting = true
  this._iterator.next(this._send)
}

Iterator.prototype.close = function () {
  if (this[kClosed]) return
  this[kClosed] = true
  this._iterator.close(noop)
}

function errorCode (err) {
  if (err == null) {
    return undefined
  } else if (typeof err.code === 'string' && err.code.startsWith('LEVEL_')) {
    return err.code
  } else {
    return 'LEVEL_REMOTE_ERROR'
  }
}

function cleanRangeOptions (options) {
  const result = {}

  for (const k in options) {
    if (!hasOwnProperty.call(options, k)) continue

    if (!rangeOptions.has(k) || options[k] != null) {
      result[k] = options[k]
    }
  }

  result.keyEncoding = 'buffer'
  result.valueEncoding = 'buffer'

  return result
}
