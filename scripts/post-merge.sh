#!/bin/bash
set -e
npm install --prefer-offline
node scripts/cleanup-orphan-streams.mjs
npm run db:push -- --force
