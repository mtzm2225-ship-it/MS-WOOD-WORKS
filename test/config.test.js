const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const validEnvironment = {
  ...process.env,
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/mswood_test',
  PGHOST: '',
  PGDATABASE: '',
  PGUSER: '',
  PGPASSWORD: '',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'test-only-admin-password-long-enough',
  OWNER_USERNAME: 'owner@example.test',
  OWNER_PASSWORD: 'test-only-owner-password-long-enough',
  SESSION_SECRET: 'test-only-session-secret-long-enough'
};

const requiredSettings = [
  ['DATABASE_URL', 'Set DATABASE_URL or PGHOST'],
  ['ADMIN_EMAIL', 'Set ADMIN_EMAIL'],
  ['ADMIN_PASSWORD', 'Set ADMIN_EMAIL and a unique ADMIN_PASSWORD'],
  ['OWNER_USERNAME', 'Set OWNER_USERNAME'],
  ['OWNER_PASSWORD', 'Set OWNER_PASSWORD'],
  ['SESSION_SECRET', 'SESSION_SECRET must be at least 32 characters']
];

test('server refuses to start without explicitly configured credentials and database secrets', () => {
  for (const [setting, expectedError] of requiredSettings) {
    const env = { ...validEnvironment, [setting]: '' };
    const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))})`], {
      cwd: os.tmpdir(),
      env,
      encoding: 'utf8'
    });

    assert.notEqual(result.status, 0, `${setting} must be required`);
    assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(expectedError));
  }
});

test('server accepts separate PostgreSQL connection settings with special-character passwords', () => {
  const env = {
    ...validEnvironment,
    DATABASE_URL: '',
    PGHOST: 'localhost',
    PGPORT: '5432',
    PGDATABASE: 'mswood_test',
    PGUSER: 'mswood_test',
    PGPASSWORD: 'test:@/# with spaces'
  };
  const result = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'server.js'))})`], {
    cwd: os.tmpdir(),
    env,
    encoding: 'utf8'
  });

  assert.equal(result.status, 0, result.stderr);
});
