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

First create a server:

```js
const manylevel = require('many-level')
const { pipeline } = require('readable-stream')
const level = require('level')
const net = require('net')

const db = level('./db')

const server = net.createServer(function (socket) {
  pipeline(socket, manylevel.server(db), socket, () => {
    // Optionally do something when socket has disconnected
  })
})

server.listen(9000)
```

Then create some clients:

```js
const manylevel = require('many-level')
const { pipeline } = require('readable-stream')
const net = require('net')

const db = manylevel.client()
const socket = net.connect(9000)

pipeline(socket, db.connect(), socket, () => {
  // Optionally do something when socket has disconnected
})

await db.put('hello', 'world')
console.log(await db.get('hello'))
```

Encoding options are supported as usual.

## Reconnect

To setup reconnect in your client set the `retry` option to `true` and reconnect to your server when the connection fails:

```js
const manylevel = require('many-level')
const { pipeline } = require('readable-stream')
const net = require('net')

const db = manylevel.client({
  retry: true
})

const connect = function () {
  const socket = net.connect(9000)

  pipeline(socket, db.connect(), socket, () => {
    setTimeout(connect, 1000) // reconnect after 1s
  })
}

connect()
```

`many-level` will now make sure to retry your pending operations when you reconnect. If you create a read stream and your connection fails half way through reading that stream `many-level` makes sure to only retry the part of the stream you are missing. Please note that this might not guarantee leveldb snapshotting if you rely on that.

## API

#### `stream = manylevel.server(db, [options])`

Returns a new duplex server stream that you should connect with a client. Options include:

```js
{
  readonly: true, // make the database be accessible as read only
  preput: function (key, val, cb) {}, // called before puts
  predel: function (key, cb) {}, // called before dels
  prebatch: function (batch, cb) {} // called before batches
}
```

#### `clientDb = manylevel.client([options])`

Creates a new `abstract-level` database that you should connect with a server. The optional `options` object may contain:

- `keyEncoding` (string or object, default `'utf8'`): encoding to use for keys
- `valueEncoding` (string or object, default `'utf8'`): encoding to use for values.

See [Encodings](https://github.com/Level/abstract-level#encodings) for a full description of these options.

#### `stream = clientDb.connect()`

Returns a new duplex client stream that you should connect with a server stream.

#### `stream = clientDb.createRpcStream()`

An alias to `.connect` for [`multileveldown`](https://github.com/Level/multileveldown) and originally [`multilevel`](https://github.com/juliangruber/multilevel) API compatibility.

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
