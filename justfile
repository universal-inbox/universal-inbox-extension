version := `node -p "require('./package.json').version"`

default:
    @just --choose

install:
    npm install

run:
    npm run dev

run-firefox:
    npm run dev-firefox

start:
    npm run start

build version=version:
    #!/usr/bin/env bash
    set -euo pipefail

    npm run build
    cd dist/chrome
    # Strip Firefox-only permissions rejected by the Chrome Web Store
    jq '.permissions -= ["contextualIdentities", "webRequestBlocking"]' manifest.json > manifest.tmp.json
    mv manifest.tmp.json manifest.json
    rm -f ../../universal-inbox-extension-chrome-v{{ version }}.zip
    zip -r ../../universal-inbox-extension-chrome-v{{ version }}.zip .

build-firefox version=version:
    #!/usr/bin/env bash
    set -euo pipefail

    npm run build-firefox
    cd dist/firefox
    rm -f ../../universal-inbox-extension-firefox-v{{ version }}.zip
    zip -r ../../universal-inbox-extension-firefox-v{{ version }}.zip .

build-source:
    git ls-files | zip -@ universal-inbox-extension-src.zip

format:
    npm run format

type-check:
    npm run type-check

lint:
    npm run lint

check: type-check lint
