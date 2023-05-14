#!/bin/bash

set -e

# NOTE: we overwrite the identity-instance.ts file with the react native version
# so the correct type definitions are exported for react-native. This is the
# only difference the web version and the react-native version. This is a hacky
# way to do this but it works for now. If you know of a better way to do this,
# please feel free to submit a PR.
mv ./src/identity/identity-instance.react-native.ts ./src/identity/identity-instance.ts
npm run build
cp {package.json,LICENSE} ./lib
cp REACT-NATIVE.md ./lib/README.md
cd ./lib
npm pkg delete scripts
npm pkg set name='deso-protocol-react-native'
cd -
git checkout ./src
