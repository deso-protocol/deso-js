#!/bin/bash

set -e

npm run build
cp {package.json,README.md,LICENSE} ./lib
cd ./lib
npm pkg delete scripts
cd -
