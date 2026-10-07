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

# Tag the current commit as v<version> and push the branch then the tag.
# Pushing a v* tag runs the build-and-publish workflow (store release).
release-tag version=version remote="github":
    #!/usr/bin/env bash
    set -euo pipefail

    tag="v{{ version }}"
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ -n "$(git status --porcelain)" ]; then
        echo "Working tree is not clean, commit first" >&2
        exit 1
    fi
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        echo "Tag $tag already exists" >&2
        exit 1
    fi
    git tag "$tag"
    git push {{ remote }} "$branch"
    git push {{ remote }} "$tag"

build-source:
    git ls-files | zip -@ universal-inbox-extension-src.zip

format:
    npm run format

type-check:
    npm run type-check

lint:
    npm run lint

test:
    npm run test

check: type-check lint test
