# deso-protocol

Client side typescript/javascript SDK for building web3 applications for the [DeSo blockchain](https://docs.deso.org).

## Installation

```sh
npm i deso-protocol
```

## Configuration

````ts
import { configure } from 'deso-protocol';

configure({
  // Here we indicate the permissions a user will be asked to approve when they
  // log into your application. You may specify as many or as few permissions up
  // front as you want. You may choose not to request any permissions up front
  // and that's okay! Just remember that you will need to request them in your
  // app progressively, and you can always request as many or as few as you want
  // using the `requestPermissions` method described in the usage section.
  //
  // See more about the spending limit options object here
  // https://docs.deso.org/for-developers/backend/blockchain-data/basics/data-types#transactionspendinglimitresponse
  // And See an exhaustive list of transaction types here:
  // https://github.com/deso-protocol/core/blob/a836e4d2e92f59f7570c7a00f82a3107ec80dd02/lib/network.go#L244
  spendingLimitOptions: {
    // NOTE: this value is in Deso nanos, so 1 Deso * 1e9
    GlobalDESOLimit: 1 * 1e9 // 1 Deso
    // Map of transaction type to the number of times this derived key is
    // allowed to perform this operation on behalf of the owner public key
    TransactionCountLimitMap: {
      BASIC_TRANSFER: 2, // 2 basic transfer transactions are authorized
      SUBMIT_POST: 4, // 4 submit post transactions are authorized
    },
  }

  // Optional node uri. Sets the uri for the node that will be used for all
  // subsequent requests. If not passed it will default to https://node.deso.org
  nodeURI: 'https://mynode.com',

  // Optional redirect URI. This is mostly useful for native mobile use cases.
  // Most web applications will not want to use it. If provided, we do a full
  // redirect to the identity domain and pass data via query params back to the
  // provided uri.
  redirectURI: 'https://mydomain.com/my-redirect-path',

  // This will be associated with all of the derived keys that your application
  // authorizes.
  appName: 'My Cool App',

  // this is optional, if not passed the default of 1500 will be used.
  MinFeeRateNanosPerKB: 1000,


  // THE FOLLOWING CONFIGURATIONS ARE ONLY NEEDED IN A REACT NATIVE CONTEXT

  /**
   * An optional storage provider. If not provided, we will assume localStorage
   * is available. In react native this will typically be an async storage
   * class.
   */
  storageProvider?: Storage | AsyncStorage;

  /**
   * An optional function that is provided the identity url that needs to be
   * opened. This can be used to customize how the identity url is opened. For
   * example, if you are using react native, you might want to use the WebBrowser
   * API to open the url in a system browser window.
   * @example
   * ```ts
   * identityPresenter: async (url) => {
   *   const result = await WebBrowser.openAuthSessionAsync(url);
   *   if (result.type === 'success') {
   *     identity.handleRedirectURI(result.url);
   *   }
   * },
   * ```
   */
  identityPresenter?: (url: string) => void;
})
````

## Usage

### Identity: (logging in and out, creating new accounts, etc)

```ts
import { identity } from 'deso-protocol';

// Subscribe to identity state changes (user login/logout, permissions updated,
// etc).  This is useful for binding your preferred framework's state management
// system to the identity instance's internal state. The function you provide to
// `subscribe` will be called anytime identity's internal state changes.
identity.subscribe((state) => {
  // The event property is a string value that tells you what triggered the
  // subscribe call. Useful for setting loading states or otherwise making
  // decisions about how you want your app to react to identity state.
  // You can see an exhaustive list of the events here: https://github.com/deso-protocol/deso-js/blob/4d91fd7a66debd2aa0b0b49c0ccb872c0c849d49/src/identity/types.ts#L225
  const event = state.event;

  // The current user object contains the user's current permissions
  // (TransactionCountLimitMap).  This value will be updated when the logged in
  // user changes or when the permissions change for the current user. Read
  // more about the transaction count limit map here
  // https://docs.deso.org/for-developers/backend/blockchain-data/basics/data-types#transactionspendinglimitresponse
  const currentUser = state.currentUser;

  // A list of all users that a given user has logged in with (excluding
  // currentUser). This is useful if you want to show a list of accounts and
  // provide a way to switch accounts easily.
  const alernateUsers = state.alternateUsers;
});

// Start a login flow
await identity.login();

// Start a logout flow
await identity.logout();

// Switch users (for apps that manage multiple accounts for a single user).
// NOTE: The publicKey here must be a user that has previously logged in.
identity.setActiveUser(publicKey);

// Generate a jwt for making authenticated requests via `Authorization` http
// header.
await identity.jwt();

// Sign and submit a transaction. This is handled for you if you're using any
// of the provided transaction creation helpers. But you can also do this yourself
// if you have a more complex use case.
const tx = await axios.post('https://node.deso.org/api/v0/submit-post');
const submittedTx = await identity.signAndSubmit(tx);

// For some use cases, you might want to handle signing, submitting,
// and retrying yourself. Here's an example of handling each step of the process
// yourself.
const postTransaction = await axios.post(
  'https://node.deso.org/api/v0/submit-post'
);
const signedTx = await identity.signTx(postTransaction.TransactionHex);
const submittedTx = await identity.submitTx(signedTx);

// Checking for permissions is straightforward. Here we check if our app can
// post on behalf of a user Read more about the transaction count limit map here
// https://docs.deso.org/for-developers/backend/blockchain-data/basics/data-types#transactionspendinglimitresponse and you can find an exhaustive list
// of available transaction types here: https://github.com/deso-protocol/core/blob/a836e4d2e92f59f7570c7a00f82a3107ec80dd02/lib/network.go#L244
// This returns a boolean value synchronously.
const hasPermission = identity.hasPermissions({
  TransactionCountLimitMap: {
    SUBMIT_POST: 1,
  },
});

// Here we request approval for permissions from a user.  This will present the
// user with the deso identity approve derived key UI.
if (!hasPermissions) {
  await identity.requestPermissions({
    TransactionCountLimitMap: {
      SUBMIT_POST: 1,
    },
  });
}

// Encrypt plain text with the recipients public key. This can be subsequently
// decrypted using the recipient's private key.
const encryptedMessageHex = await identity.encryptMessage(
  recipientPublicKeyBase58Check,
  plaintextMsg
);

// Decrypt a message returned from any of the message endpoints of the deso
// backend messages api. If it is a group message you will need to fetch the
// groups the user is a member of and provide them. If it's known that the
// message is not a a group message you can pass an empty array for the groups
// parameter.
//
// See the api docs for sending and receiving messages here:
// https://docs.deso.org/deso-backend/api/messages-endpoints
//
// See the api docs for access groups here:
// https://docs.deso.org/deso-backend/api/access-group-endpoints
const decryptedMessagePlaintext = await identity.decryptMessage(
  message,
  accessGroups
);
```

### Data: fetching data from a node

```ts
import { getUsersStateless, getPostsStateless } from 'deso-protocol';

const users = await getUsersStateless({
  PublicKeysBase58Check: [key1, key2, ...rest],
});

const posts = await getPostsStateless({ NumToFetch: 20 });
```

See the [backend api documentation](https://docs.deso.org/deso-backend/api) for reference.
See an exhaustive list of the available data fetching functions [here](https://github.com/deso-protocol/deso-js/blob/4d91fd7a66debd2aa0b0b49c0ccb872c0c849d49/src/data/data.ts#L116).

### Transactions: Writing data to the blockchain

The deso-protocol library will handle signing and submitting transactions for
confirmation for you. All you need to do is construct them by providing the raw
data.

```ts
import { submitPost } from 'deso-protocol';

const txInfo = submitPost({
  UpdaterPublicKeyBase58Check: currentUser.publicKey,
  BodyObj: {
    Body: 'My first post on DeSo!',
    ImageURLs: [],
    VideoURLs: [],
  },
});
```

See the [transaction construction api documentation](https://docs.deso.org/deso-backend/construct-transactions) for reference.
See an exhaustive list of the available transaction construction functions [here](https://github.com/deso-protocol/deso-js/tree/main/src/transactions)

## React Native (beta)

React native support is a work in progress, but there is a beta version
available if you'd like to test to it out. You will need to run react native
version `0.71.7` or later to ensure `BigInt` support is available.

### Installation

```sh
npm i deso-protocol@beta
```

There a few peer dependencies that are required for everything to work smoothly.

```sh
npm i react-native-get-random-values react-native-webview react-native-webview-crypto text-encoding @react-native-async-storage/async-storage @ethersproject/shims
```

NOTE: you may need to install native modules for the target platform. For iOS you can do this via cocoapods:

```sh
cd ios && pod install && cd -
```

You will need to add these shims to your application:

```ts
// NOTE: shims must be imported into index.js before anything else and the order
// is important!
import 'react-native-get-random-values';

// The deso-protocol lib depends on the ethers library. See the following for more info:
// https://docs.ethers.org/v5/cookbook/react-native/
import '@ethersproject/shims';

// deso-protocol needs TextEncoder/Decoder and expects it in the global scope
import { TextDecoder, TextEncoder } from 'text-encoding';

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}

if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}
```

`deso-protocol` requires the web crypto APIs, which are provided via
the
[react-native-webview-crypto](https://github.com/webview-crypto/react-native-webview-crypto)
package. TL;DR you need to render a hidden webview at the top level of your app
to proxy crypto method calls to, so please pay special attention to their [usage
documentation](https://github.com/webview-crypto/react-native-webview-crypto#usage).

And finally you will need to configure `deso-protocol` with a `redirectURI`, `identityPresenter`, and `storageProvider`.
If you are using [Expo](https://expo.dev) it is very easy to set things up.

```ts
import { configure } from 'deso-protocol';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

configure({
  // This is the deep link back into your application. NOTE: You will need to
  // set a scheme value in your app.json
  redirectURI: AuthSession.makeRedirectUri(),

  // This will open the identity login page in the system browser, and once the
  // browser flow is complete the result object will have the payload passed
  // back from identity in the query parameters.
  identityPresenter: async (url) => {
    const result = await WebBrowser.openAuthSessionAsync(url);
    if (result.type === 'success') {
      identity.handleRedirectURI(result.url);
    }
  },

  // This will be the persistent storage used to keep people logged in.
  // For this example we're using @react-native-async-storage/async-storage
  // but there are several other options that could work https://reactnative.directory/?search=storage
  storageProvider: AsyncStorage,

  // ...rest of configs
});
```

## Contributing

Pull requests are welcome!

### Setup

- Clone this repo

```sh
  git clone ...
  cd deso-js
```

### Useful workflows

- Run the test suite

```sh
npm run test
```

- Link local changes into another project

```sh
# in the deso-js root directory run
npm run link

# navigate to your project's root
cd $your_project_root_dir

# create symlink in node_modules that points to your local copy of deso-protocol
npm link deso-protocol
```
