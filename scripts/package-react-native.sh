#!/bin/bash

set -e

# NOTE: we overwrite the identity-instance.ts file with the native version so
# the correct type definitions are exported for react-native. This is the only
# difference the web version and the react-native version.
mv ./src/identity/identity-instance.react-native.ts ./src/identity/identity-instance.ts
npm run build
cp {package.json,LICENSE} ./lib
cp REACT-NATIVE.md ./lib/README.md
cd ./lib
npm pkg delete scripts
npm pkg set name='deso-protocol-react-native'
cd -
git checkout ./src
