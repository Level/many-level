'use strict'

// Based on https://github.com/mafintosh/length-prefixed-stream

const varint = require('varint')
const { Transform } = require('stream')

let pool = Buffer.allocUnsafeSlow(10 * 1024)
let used = 0

function encode () {
  return new Transform({
    transform (data, encoding, cb) {
      varint.encode(data.length, pool, used)
      used += varint.encode.bytes

      this.push(pool.slice(used - varint.encode.bytes, used))
      this.push(data)

      if (pool.length - used < 100) {
        pool = Buffer.allocUnsafeSlow(10 * 1024)
        used = 0
      }

      cb()
    }
  })
}
class Decoder extends Transform {
  constructor (...args) {
    super(...args)

    this._missing = 0
    this._message = null
    this._prefix = Buffer.allocUnsafe(100)
    this._ptr = 0
  }

  _push (message) {
    this._ptr = 0
    this._missing = 0
    this._message = null
    this.push(message)
  }

  _parseLength (data, offset) {
    for (offset; offset < data.length; offset++) {
      if (this._ptr >= this._prefix.length) {
        throw new Error('Message is larger than max length')
      }

      this._prefix[this._ptr++] = data[offset]
      if (!(data[offset] & 0x80)) {
        this._missing = varint.decode(this._prefix)
        this._ptr = 0
        return offset + 1
      }
    }
    return data.length
  }

  _parseMessage (data, offset) {
    const free = data.length - offset
    const missing = this._missing

    if (!this._message) {
      if (missing <= free) { // fast track - no copy
        this._push(data.slice(offset, offset + missing))
        return offset + missing
      }
      this._message = Buffer.allocUnsafe(missing)
    }

    data.copy(this._message, this._ptr, offset, offset + missing)

    if (missing <= free) {
      this._push(this._message)
      return offset + missing
    }

    this._missing -= free
    this._ptr += free

    return data.length
  }

  _transform (data, encoding, cb) {
    let offset = 0

    while (offset < data.length) {
      if (this._missing) offset = this._parseMessage(data, offset)
      else offset = this._parseLength(data, offset)
    }

    cb()
  }
}

function decode () {
  return new Decoder()
}

module.exports = {
  encode,
  decode
}
