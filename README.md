# Matrix CRDT

[![npm version](https://badge.fury.io/js/matrix-crdt.svg)](https://badge.fury.io/js/matrix-crdt) [![Coverage Status](https://coveralls.io/repos/github/YousefED/Matrix-CRDT/badge.svg?branch=main)](https://coveralls.io/github/YousefED/Matrix-CRDT?branch=main)

Matrix-CRDT enables you to use [Matrix](https://matrix.org/) as a backend for distributed, real-time collaborative web applications that sync automatically.

< TODO >

- snapshot architecture (and last_event_id)
- real time (webrtc)

## Usage with Yjs

To setup Matrix-CRDT, 3 steps are needed:

- Create a [Yjs](https://github.com/yjs/yjs) `Y.Doc`
- Create and authenticate a client from [matrix-js-sdk](https://matrix.org/docs/guides/usage-of-the-matrix-js-sdk)
- Create and initialize your Matrix-CRDT `MatrixProvider`

```typescript
import { MatrixProvider } from "matrix-crdt";
import * as Y from "yjs";
import sdk from "matrix-js-sdk";

// See https://matrix.org/docs/guides/usage-of-the-matrix-js-sdk
// for login methods
const matrixClient = sdk.createClient({
  baseUrl: "https://matrix.org",
  accessToken: "....MDAxM2lkZW50aWZpZXIga2V5CjAwMTBjaWQgZ2Vu....",
  userId: "@USERID:matrix.org",
});

// Create a new Y.Doc and connect the MatrixProvider
const ydoc = new Y.Doc();
const provider = new MatrixProvider(ydoc, matrixClient, {
  type: "alias",
  alias: "matrix-room-alias",
});
provider.initialize();

// array of numbers which produce a sum
const yarray = ydoc.getArray("count");

// observe changes of the sum
yarray.observe((event) => {
  // print updates when the data changes
  console.log("new sum: " + yarray.toArray().reduce((a, b) => a + b));
});

// add 1 to the sum
yarray.push([1]); // => "new sum: 1"
```

## SyncedStore

You can also use [SyncedStore](https://syncedstore.org/docs/) and use Matrix-CRDT as SyncProvider.

# Development

We use [Lerna](https://lerna.js.org/) to manage the monorepo with separate packages.

## Running

Node.js is required to run this project. To download Node.js, visit [nodejs.org](https://nodejs.org/en/).

To run the project, open the command line in the project's root directory and enter the following commands:

    # Install all required npm modules for lerna, and bootstrap lerna packages
    npm run install-lerna
    npm run bootstrap

    # Build all projects
    npm run build

    # Tests
    npm run test

## Watch changes

    npm run watch

## Updating packages

If you've pulled changes from git that add new or update existing dependencies, use `npm run bootstrap` instead of `npm install` to install updated dependencies!

## Adding packages

- Add the dependency to the relevant `package.json` file (packages/xxx/packages.json)
- run `npm run install-new-packages`
- Double check `package-lock.json` to make sure only the relevant packages have been affected
