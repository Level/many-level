# many-level

**Expose an [abstract-level](https://github.com/Level/abstract-level) database over the network or other kind of stream.** The successor to [`multileveldown`](https://github.com/Level/multileveldown). If you are upgrading, please see [UPGRADING.md](UPGRADING.md).

> :pushpin: Which module should I use? What is `abstract-level`? Head over to the [FAQ](https://github.com/Level/community#faq).

[![level badge][level-badge]](https://github.com/Level/awesome)
[![npm](https://img.shields.io/npm/v/many-level.svg)](https://www.npmjs.com/package/many-level)
[![Node version](https://img.shields.io/node/v/many-level.svg)](https://www.npmjs.com/package/many-level)
[![Test](https://img.shields.io/github/workflow/status/Level/many-level/Test?label=test)](https://github.com/Level/many-level/actions/workflows/test.yml)
[![Coverage](https://img.shields.io/codecov/c/github/Level/many-level?label=&logo=codecov&logoColor=fff)](https://codecov.io/gh/Level/many-level)
[![Standard](https://img.shields.io/badge/standard-informational?logo=javascript&logoColor=fff)](https://standardjs.com)
[![Common Changelog](https://common-changelog.org/badge.svg)](https://common-changelog.org)
[![Donate](https://img.shields.io/badge/donate-orange?logo=open-collective&logoColor=fff)](https://opencollective.com/level)

## Usage

Similar to [`multilevel`](https://github.com/juliangruber/multilevel) you can use this to share an `abstract-level` database across multiple processes over a stream. In addition `many-level` supports seamless retry so you can reconnect to a server without your read streams / puts failing etc.

First create a server (can be anything that supports binary streams):

```js
const { ManyLevelHost } = require('many-level')
const { Level } = require('level')
const { pipeline } = require('readable-stream')
const { createServer } = require('net')

const db = new Level('./db')
const host = new ManyLevelHost(db)

const server = createServer(function (socket) {
  // Pipe socket into host stream and vice versa
  pipeline(socket, host.createRpcStream(), socket, () => {
    // Disconnected
  })
})

server.listen(9000)
```

Then create some clients:

```js
const { ManyLevelGuest } = require('many-level')
const { pipeline } = require('readable-stream')
const { connect } = require('net')

const db = new ManyLevelGuest()
const socket = connect(9000)

// Pipe socket into guest stream and vice versa
pipeline(socket, db.createRpcStream(), socket, () => {
  // Disconnected
})

await db.put('hello', 'world')
console.log(await db.get('hello'))
```

Encoding options are supported as usual.

## Reconnect

To setup reconnect set the `retry` option to `true` and reconnect to your server when the connection fails:

```js
const { ManyLevelGuest } = require('many-level')
const { pipeline } = require('readable-stream')
const { connect } = require('net')

const db = new ManyLevelGuest({
  retry: true
})

const reconnect = function () {
  const socket = connect(9000)

  pipeline(socket, db.createRpcStream(), socket, () => {
    // Reconnect after 1 second
    setTimeout(reconnect, 1000)
  })
}

reconnect()
```

`many-level` will now make sure to retry your pending operations when you reconnect. If you create a read stream and your connection fails half way through reading that stream `many-level` makes sure to only retry the part of the stream you are missing. Please note that this might not guarantee leveldb snapshotting if you rely on that.

## API

### Host

#### `host = new ManyLevelHost(db, [options])`

Create a new host that exposes `db` to clients. The `db` argument must be an `abstract-level` database that supports the `'buffer'` encoding (most if not all do). It can also be a sublevel (because `db.sublevel()` itself returns an `abstract-level` database) which allows for exposing a specific section of the database.

The optional `options` object may contain:

```js
{
  readonly: true, // make the database be accessible as read only
  preput: function (key, val, cb) {}, // called before puts
  predel: function (key, cb) {}, // called before dels
  prebatch: function (batch, cb) {} // called before batches
}
```

#### `hostStream = host.createRpcStream()`

Create a duplex host stream to be piped into a guest stream.

### Guest

#### `db = new ManyLevelGuest([options])`

Create a guest database that reads and writes to the host's database. The `ManyLevelGuest` class extends `AbstractLevel` and thus follows the public API of [abstract-level](https://github.com/Level/abstract-level). It opens itself, but unlike other `abstract-level` implementations, cannot be re-opened once `db.close()` has been called.

The optional `options` object may contain:

- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values
- `retry` (boolean, default `false`): if true, resend operations when reconnected. If false, abort operations when disconnected, which means to yield an error on e.g. `db.get()`.

See [Encodings](https://github.com/Level/abstract-level#encodings) for a full description of the encoding options.

#### `guestStream = db.createRpcStream([options])`

Create a duplex guest stream to be piped into a host stream. Will throw if `createRpcStream()` was previously called and that stream has not closed. The optional `options` object may contain:

- `ref` (object, default `null`): an object to only keep the Node.js event loop alive while there are pending database operations. Should have a `ref()` method to be called on a new operation like `db.get()` and an `unref()` method to be called when all operations have finished (or when the database is closed). A Node.js `net` socket satisfies that interface. The `ref` option is not relevant when `ManyLevelGuest` is used in a browser environment.

Until this stream has been piped into a (connected) stream, operations made on `db` are queued up in memory.

#### `guestStream = db.connect()`

An alias to `createRpcStream()` for [`multileveldown`](https://github.com/Level/multileveldown) API compatibility.

## Install

With [npm](https://npmjs.org) do:

```
npm i many-level
```

## Contributing

[`Level/many-level`](https://github.com/Level/many-level) is an **OPEN Open Source Project**. This means that:

> Individuals making significant and valuable contributions are given commit-access to the project to contribute as they see fit. This project is more like an open wiki than a standard guarded open source project.

See the [Contribution Guide](https://github.com/Level/community/blob/master/CONTRIBUTING.md) for more details.

## Donate

Support us with a monthly donation on [Open Collective](https://opencollective.com/level) and help us continue our work.

## License

[MIT](LICENSE)

[level-badge]: https://leveljs.org/img/badge.svg
