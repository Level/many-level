# Upgrade Guide

This document describes breaking changes and how to upgrade. For a complete list of changes including minor and patch releases, please refer to the [changelog](CHANGELOG.md).

## 6.0.0

_WIP notes_

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

The error codes are also used in communication between server and client. Server-side error messages stay server-side; it now only sends codes to the client. For unexpected errors, the code received by a client will be `LEVEL_REMOTE_ERROR`.

All together, here are the errors to be expected from `many-level`:

| Message                     | Code                                                 |
|:----------------------------|:-----------------------------------------------------|
| `Connection to leader lost` | `LEVEL_CONNECTION_LOST` or `LEVEL_DATABASE_NOT_OPEN` |
| `Database is readonly`      | `LEVEL_READONLY`                                     |
| Any other message           | `LEVEL_REMOTE_ERROR`                                 |

### Other

- Semi-private properties like `_ended` and `_clearRequests()` have been replaced with symbols and are no longer accessible
- Drops support of Node 10

## 5.0.0

This release drops support of legacy runtime environments ([Level/community#98](https://github.com/Level/community/issues/98)):

- Internet Explorer 11
- Safari 9-11
- Stock Android browser (AOSP).

In browsers, the [`immediate`](https://github.com/calvinmetcalf/immediate) shim for `process.nextTick()` has been replaced with the smaller [`queue-microtask`](https://github.com/feross/queue-microtask), except in streams.
