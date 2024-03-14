#!/bin/bash

set -e

echo "::notice::RELEASE_TARGET: $RELEASE_TARGET"
exit 0

# Script used in github actions workflows to publish based on release tag.

# Tags should be formatted in the following way:
# v<version-number>
# example: v0.0.1
#
# For a pre-release, use the following format:
# <version-number>-beta.<pre-release-version>
# example: v0.0.1-beta.0
NEW_VERSION=$(git describe --tags --abbrev=0)
NPM_PRERELEASE_TAG=$(echo $NEW_VERSION | cut -d '-' -f 2 | cut -d '.' -f 1)

echo "Preparing to release $NEW_VERSION"
echo "Pre-release tag: $NPM_PRERELEASE_TAG"

npm ci --ignore-scripts
npm version --no-git-tag-version $NEW_VERSION
npm run package
cd ./lib

# If the version is a pre-release (beta), publish with the --tag flag.
if [[ $NPM_PRERELEASE_TAG == beta ]]; then
  echo "Publishing pre-release version $NEW_VERSION"
  npm publish --tag $NPM_PRERELEASE_TAG --access public
# if the parsed prelease tag is a number, it's just a regular release.
elif [[ $NPM_PRERELEASE_TAG =~ ^[0-9]+$ ]]; then
  echo "Publishing latest stable version $NEW_VERSION"
  npm publish --access public
else
  echo "Invalid version format for $NEW_VERSION. Please use the following format: v<version-number> or v<version-number>-beta.<pre-release-version>"
  exit 1
fi

cd -

RELEASE_VERSION=$(grep version package.json | awk -F \" '{print $4}')
echo "::notice::New version successfully released: $RELEASE_VERSION"
git add package*.json
git commit -nm "ci: automated release version $RELEASE_VERSION"
git pull --rebase origin $RELEASE_TARGET
git push origin HEAD:$RELEASE_TARGET
