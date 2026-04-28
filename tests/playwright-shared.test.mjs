import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syntheticDemoClientIpForIndex } from './playwright/shared.mjs';

test('Playwright demo client IP helper gives each demo seed a distinct IPv4 bucket', () => {
  const ips = Array.from({ length: 310 }, (_, index) => syntheticDemoClientIpForIndex(index));

  assert.equal(ips[0], '203.0.0.1');
  assert.equal(ips[249], '203.0.0.250');
  assert.equal(ips[250], '203.0.1.1');
  assert.equal(new Set(ips).size, ips.length);
  for (const ip of ips) {
    assert.match(ip, /^203\.0\.\d+\.(?:[1-9]\d?|1\d\d|2[0-4]\d|250)$/);
  }
});
