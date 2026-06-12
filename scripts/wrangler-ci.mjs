#!/usr/bin/env node

process.env.CI = process.env.CI || 'true';

await import('./wrangler-oauth.mjs');
