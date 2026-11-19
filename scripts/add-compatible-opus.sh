#!/usr/bin/env bash
# Adds @discordjs/opus's glibc-2.35 prebuild to node_modules before a Linux package is built. npm installs the build
# matching the runner's glibc (2.43 on ubuntu-latest), which needs GLIBC_2.43 at runtime and so would not load on
# most distributions. The glibc-2.35 build needs only GLIBC_2.29, and the app's loader tries prebuild folders in
# name order, so it loads first. The archive is checked against the SHA-256 digest GitHub reports for the asset.
set -euo pipefail

version=$(node -p "require('@discordjs/opus/package.json').version")
abi=$(node -p "process.versions.modules")
arch=$(node -p "process.arch")
folder="node-v${abi}-napi-v3-linux-${arch}-glibc-2.35"
asset="opus-v${version}-${folder}.tar.gz"
prebuild=$(node -p "require('path').join(require('path').dirname(require.resolve('@discordjs/opus/package.json')), 'prebuild')")
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

gh release download "v${version}" --repo discordjs/opus --pattern "$asset" --dir "$work"
expected=$(gh api "repos/discordjs/opus/releases/tags/v${version}" --jq ".assets[] | select(.name == \"${asset}\") | .digest")
actual="sha256:$(sha256sum "$work/$asset" | cut -d' ' -f1)"
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "::error::${asset} hashes to ${actual}, but GitHub reports ${expected:-no digest}"
  exit 1
fi

tar -xzf "$work/$asset" -C "$prebuild" "${folder}/opus.node"
test -f "$prebuild/$folder/opus.node"
echo "Added ${folder} (${actual})"
ls "$prebuild"
