// SPDX-License-Identifier: MIT
// Expected-parity RED, intentionally not a passing regression or production fix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../../packages/core/src/parser/index.js';
const c=parse(readFileSync('benchmarks/vendor-expanded-node-917/table-isolated.cir','utf8')).compile();
assert.equal(c.nodeNames.some(name=>/\.TABLE$/i.test(name)),false,'TABLE is syntax, not an MNA node');
assert.equal(c.nodeNames.some(name=>/[{}]/.test(name)),false,'TABLE expression must not become an MNA node');
