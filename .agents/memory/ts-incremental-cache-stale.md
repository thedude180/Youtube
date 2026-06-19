---
name: TypeScript incremental build cache stale
description: When typecheck keeps reporting pre-edit errors despite verified file changes — clear the tsbuildinfo cache
---

# TypeScript Incremental Build Cache Goes Stale

## The Rule
When `typecheck` workflow reports errors at the same exact line numbers + column numbers
even after files have been clearly updated (verified via `read` or `sed`), the incremental
build cache is serving stale compiled state.

## Why
`tsconfig.json` has `"incremental": true` with `"tsBuildInfoFile": "./node_modules/typescript/tsbuildinfo"`.
When the workflow runs again quickly after an edit, TypeScript reads the cached `.d.ts` state
from the `.tsbuildinfo` file instead of re-parsing source files. The workflow "succeeds" (finishes)
but uses old type information from before the edit.

## How to apply
1. Verify the file really IS updated: `sed -n 'N,Mp' server/path/to/file.ts`
2. If file is correct but typecheck still errors at same lines: `rm -f ./node_modules/typescript/tsbuildinfo`
3. Restart the typecheck workflow — it will do a full clean pass (takes ~60-90s)
