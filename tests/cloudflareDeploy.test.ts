import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const projectUrl = new URL('../', import.meta.url);

test('Cloudflare deploy uses a committed static-assets configuration', () => {
  const config = JSON.parse(readFileSync(new URL('wrangler.jsonc', projectUrl), 'utf8')) as {
    name?: string;
    main?: string;
    assets?: { directory?: string; binding?: string; not_found_handling?: string };
  };

  assert.equal(config.name, 'gsat-study-tracker-public');
  assert.equal(config.main, undefined);
  assert.equal(config.assets?.directory, './dist');
  assert.equal(config.assets?.binding, undefined);
  assert.equal(config.assets?.not_found_handling, 'single-page-application');
});

test('Cloudflare tooling and runtime are pinned for reproducible builds', () => {
  const packageJson = JSON.parse(readFileSync(new URL('package.json', projectUrl), 'utf8')) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const nodeVersion = readFileSync(new URL('.node-version', projectUrl), 'utf8').trim();

  assert.equal(packageJson.devDependencies?.wrangler, '4.132.0');
  assert.equal(packageJson.scripts?.['deploy:cloudflare'], 'npm run build && wrangler deploy');
  assert.equal(nodeVersion, '22');
});
