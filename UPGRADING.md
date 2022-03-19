# Upgrade Guide

This document describes breaking changes and how to upgrade. For a complete list of changes including minor and patch releases, please refer to the [changelog](CHANGELOG.md).

## 6.0.0

_WIP notes_

### What's new

- Throughput of iterators has doubled
- Supports `iterator.seek()`
- Reverse iterators support retry

### Changes to initialization

We started using classes, which means using `new` is now required. The server/client roles are now called host/guest. If you previously did:

```js
// Server
const multileveldown = require('multileveldown')
const stream = multileveldown.server(db, options)

// Client
const multileveldown = require('multileveldown')
const db = multileveldown.client(encodingOptions)
const stream = db.connect(options)
```

You should now do:

```js
// Host
const { ManyLevelHost } = require('many-level')
const host = new ManyLevelHost(db, options)
const stream = host.createRpcStream()

// Guest
const { ManyLevelGuest } = require('many-level')
const db = new ManyLevelGuest(encodingOptions)
const stream = db.createRpcStream(options)
```

Arguments and options are the same. The previous exports (`server` and `client`) are still available but log a deprecation warning.

### Protocol changes

A `many-level` guest cannot talk to a `multileveldown` server due to breaking changes in the protocol. This means both ends must be upgraded to `many-level`.

### Error codes

Like `abstract-level`, `many-level` started using [error codes](https://github.com/Level/abstract-level#errors). The specific error messages that `multileveldown` had did not change, but it is a breaking change in the sense that going forward, the semver contract will be on codes instead of messages (which, in other words, may change at any time). If you previously did:

```js
try {
  await db.get('abc')
} catch (err) {
  if (err.message === 'Connection to leader lost') {
    // ..
  }
}
```

You should now do:

```js
try {
  await db.get('abc')
} catch (err) {
  if (err.code === 'LEVEL_CONNECTION_LOST') {
    // ..
  }
}
```

Previously, the `Connection to leader lost` error was also used upon a `db.close()` (in addition to upon loss of connection). Closing the database while it has pending operations now results in a `LEVEL_DATABASE_NOT_OPEN` error on those operations. This is the same code that `abstract-level` (and therefore `many-level`) uses on operations made _after_ a `db.close()`.

The error codes are also used in communication between host and guest, instead of exposing arbitrary error messages. If the host encounters an unexpected error, the code received by a guest will be `LEVEL_REMOTE_ERROR`.

All together, here are the errors to be expected from `many-level`:

| Message                     | Code                                                 |
|:----------------------------|:-----------------------------------------------------|
| `Connection to leader lost` | `LEVEL_CONNECTION_LOST` or `LEVEL_DATABASE_NOT_OPEN` |
| `Database is readonly`      | `LEVEL_READONLY`                                     |
| Any other message           | `LEVEL_REMOTE_ERROR` or an `abstract-level` code     |

### Other

- Semi-private properties like `_ended` and `_clearRequests()` have been replaced with symbols and are no longer accessible
- Drops support of Node 10

---

_For earlier releases, before `many-level` was forked from `multileveldown` (v5.0.1), please see [the upgrade guide of `multileveldown`](https://github.com/Level/multileveldown/blob/HEAD/UPGRADING.md)._
