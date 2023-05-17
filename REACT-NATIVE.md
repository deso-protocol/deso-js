# deso-protocol-react-native

The support for react native is currently in beta. You will need to run [React
native](https://reactnative.dev) version `0.71.7` or later to ensure `BigInt`
support is available.

### Installation

```sh
npm i deso-protocol-react-native
```

There are a few peer dependencies that are required for everything to work smoothly.

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

`deso-protocol` requires the [web crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Crypto), which is provided via
the
[react-native-webview-crypto](https://github.com/webview-crypto/react-native-webview-crypto)
package. TL;DR you need to render a hidden webview at the top level of your app
to proxy crypto method calls to, so please pay special attention to their [usage
documentation](https://github.com/webview-crypto/react-native-webview-crypto#usage).

And finally you will need to configure `deso-protocol` with a `redirectURI`, `identityPresenter`, and `storageProvider`.
If you are using [Expo](https://expo.dev) it is very easy to set things up.

```ts
// App.tsx
import { configure } from 'deso-protocol-react-native';
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

Once everything is shimmed and configured properly, the [usage is the same as the web library](https://github.com/deso-protocol/deso-js/tree/main#usage), the major difference being you will import from `deso-protocol-react-native`.
