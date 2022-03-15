'use strict'

const lpstream = require('length-prefixed-stream')
const ModuleError = require('module-error')
const eos = require('end-of-stream')
const duplexify = require('duplexify')
const messages = require('./messages')
const { input, output } = require('./tags')

const rangeOptions = new Set(['gt', 'gte', 'lt', 'lte'])
const encodingOptions = Object.freeze({ keyEncoding: 'buffer', valueEncoding: 'buffer' })
const stateEvents = new Set(['opening', 'open', 'closing', 'closed'])
const kEnded = Symbol('ended')
const kClosed = Symbol('closed')
const kDb = Symbol('db')
const kOptions = Symbol('options')
const kSize = Symbol('size')
const kMaxItemLength = Symbol('maxItemLength')
const kPendingAcks = Symbol('pendingAcks')
const kDataMessage = Symbol('dataMessage')
const kEndMessage = Symbol('endMessage')
const noop = () => {}

// TODO: make use of db.supports manifest
class ManyLevelHost {
  constructor (db, options) {
    this[kDb] = db
    this[kOptions] = { ...options }
    this[kOptions].readonly = !!this[kOptions].readonly
    this[kOptions].preput = this[kOptions].preput || function (key, val, cb) { cb(null) }
    this[kOptions].predel = this[kOptions].predel || function (key, cb) { cb(null) }
    this[kOptions].prebatch = this[kOptions].prebatch || function (ops, cb) { cb(null) }
    this[kOptions].events = (this[kOptions].events || getEvents(db)).filter(safeEvent)
  }

  createRpcStream (streamOptions) {
    return createRpcStream(this[kDb], this[kOptions], streamOptions)
  }
}

exports.ManyLevelHost = ManyLevelHost

function getEvents (db) {
  const events = db.supports.events
  return Object.keys(events).filter(k => events[k])
}

function safeEvent (event) {
  return event && typeof event === 'string' && !stateEvents.has(event)
}

// TODO: support stream options (highWaterMark)
function createRpcStream (db, options, streamOptions) {
  const readonly = options.readonly
  const decode = lpstream.decode()
  const encode = lpstream.encode()
  const stream = duplexify(decode, encode)

  const preput = options.preput
  const predel = options.predel
  const prebatch = options.prebatch

  db.open({ passive: true }, ready)

  // TODO: send events to guest. Challenges:
  // - Need to know encodings or emit encoded data; current abstract-level events don't suffice
  // - Skip events triggered by guest itself
  // - Support data of custom events, maybe with `cbor-x` and/or extensions via manifest
  // - Include events emitted before open callback
  // for (const event of options.events) {
  //   db.on(event, ...)
  // }

  return stream

  function ready (err) {
    if (stream.destroyed) return
    if (err) return stream.destroy(err)

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
      const encoding = input.encoding(tag)

      if (!encoding) return

      let req
      try {
        req = encoding.decode(data, 1)
      } catch (err) {
        return
      }

      switch (tag) {
        case input.get: return onget(req)
        case input.put: return readonly ? onreadonly(req) : onput(req)
        case input.del: return readonly ? onreadonly(req) : ondel(req)
        case input.batch: return readonly ? onreadonly(req) : onbatch(req)
        case input.iterator: return oniterator(req)
        case input.iteratorClose: return oniteratorclose(req)
        case input.iteratorAck: return oniteratorack(req)
        case input.clear: return readonly ? onreadonly(req) : onclear(req)
        case input.getMany: return ongetmany(req)
      }
    })

    function callback (id, err, value) {
      const msg = { id, error: errorCode(err), value }
      const buf = Buffer.allocUnsafe(messages.Callback.encodingLength(msg) + 1)
      buf[0] = output.callback
      messages.Callback.encode(msg, buf, 1)
      encode.write(buf)
    }

    function getManyCallback (id, err, values) {
      const msg = { id, error: errorCode(err), values }
      const buf = Buffer.allocUnsafe(messages.GetManyCallback.encodingLength(msg) + 1)
      buf[0] = output.getManyCallback
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

      if (prev === undefined) {
        prev = new Iterator(db, req, encode)
        iterators.set(req.id, prev)
      }

      prev.next()
    }

    function oniteratorack (req) {
      const it = iterators.get(req.id)
      if (it === undefined) return
      it[kPendingAcks] = Math.max(0, it[kPendingAcks] - 1)
      it.next()
    }

    function oniteratorclose (req) {
      const it = iterators.get(req.id)
      iterators.delete(req.id)
      if (it !== undefined) it.close()
    }

    function onclear (req) {
      db.clear(cleanRangeOptions(req.options), function (err) {
        callback(req.id, err)
      })
    }
  }
}

function Iterator (db, req, encode) {
  // TODO: use symbols
  this._mode = req.options.keys && req.options.values ? 'iterator' : req.options.keys ? 'keys' : 'values'
  this._iterator = db[this._mode](cleanRangeOptions(req.options))
  this._encode = encode
  this._send = (err, items) => {
    this._nexting = false

    if (err) {
      const data = { id: this[kDataMessage].id, error: errorCode(err) }
      encode.write(encodeMessage(data, output.iteratorError))
    } else if (items.length === 0) {
      this[kEnded] = true
      encode.write(encodeMessage(this[kEndMessage], output.iteratorEnd))
    } else {
      if (this._mode === 'iterator') {
        const data = this[kDataMessage].data = new Array(items.length * 2)
        let n = 0

        for (const entry of items) {
          data[n++] = entry[0]
          data[n++] = entry[1]
        }
      } else {
        this[kDataMessage].data = items
      }

      const buf = encodeMessage(this[kDataMessage], output.iteratorData)
      const estimatedItemLength = Math.ceil(buf.length / items.length)

      encode.write(buf)

      this[kMaxItemLength] = Math.max(this[kMaxItemLength], estimatedItemLength)
      this[kPendingAcks]++

      // Read ahead
      this.next()
    }
  }
  this._nexting = false
  this[kMaxItemLength] = 1
  this[kPendingAcks] = 0
  this[kEnded] = false
  this[kClosed] = false
  this[kSize] = 0
  this[kDataMessage] = { id: req.id, data: [] }
  this[kEndMessage] = { id: req.id }
}

Iterator.prototype.next = function () {
  if (this._nexting || this[kClosed]) return
  if (this[kEnded] || this[kPendingAcks] > 1) return

  if (this[kSize] === 0) {
    // Only want 1 entry initially, for early termination use cases
    this[kSize] = 1
  } else {
    // Fill the stream's internal buffer
    const room = Math.max(1, this._encode.writableHighWaterMark - this._encode.writableLength)
    this[kSize] = Math.max(32, Math.round(room / this[kMaxItemLength]))
  }

  this._nexting = true
  this._iterator.nextv(this[kSize], this._send)
}

Iterator.prototype.close = function () {
  if (this[kClosed]) return
  this[kClosed] = true
  this._iterator.close(noop)
}

function encodeMessage (msg, tag) {
  const encoding = output.encoding(tag)
  const buf = Buffer.allocUnsafe(encoding.encodingLength(msg) + 1)
  buf[0] = tag
  encoding.encode(msg, buf, 1)
  return buf
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
