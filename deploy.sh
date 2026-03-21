#!/usr/bin/env bash
set -euo pipefail

# Crash if there are uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: uncommitted changes present. Commit or stash them before deploying." >&2
    exit 1
fi

CURRENT=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT" != "main" ]; then
    echo "Error: must be on main branch to deploy (currently on '$CURRENT')." >&2
    exit 1
fi

echo "Pulling latest main from origin..."
git pull --ff-only origin main

echo "Merging main into deploy..."
git checkout deploy
git merge --ff-only main
git push origin deploy
git checkout main

echo "Deploy branch pushed."
