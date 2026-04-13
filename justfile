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

build:
    #!/usr/bin/env bash

    npm run build
    cd dist/chrome
    sed -i -e '/"contextualIdentities"/d' -e '/"webRequestBlocking"/d' manifest.json
    sed -i -e 's/"alarms",/"alarms"/' manifest.json
    zip -r ../../universal-inbox-extension-chrome.zip .
    cd ../..

build-firefox:
    #!/usr/bin/env bash

    npm run build-firefox
    cd dist/firefox
    zip -r ../../universal-inbox-extension-firefox.zip .
    cd ../..

build-source:
    git ls-files | zip -@ universal-inbox-extension-src.zip

format:
    npm run format

type-check:
    npm run type-check

lint:
    npm run lint

check: type-check lint
