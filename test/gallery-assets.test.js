const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

test('shared gallery assets retain valid images and stable comment IDs', () => {
  const scriptPath = path.join(__dirname, '..', 'public', 'gallery-assets.js');
  const source = readFileSync(scriptPath, 'utf8');
  const window = {};
  runInNewContext(source, {
    URL,
    document: { currentScript: { src: pathToFileURL(scriptPath).href } },
    window
  });

  const { gallery, byId } = window.MSWoodGalleryAssets;
  assert.deepEqual(
    Object.keys(byId).sort(),
    [
      'brand-mark', 'brand-story', 'craft-detail', 'custom-boards', 'executive-walnut',
      'fine-interior', 'hand-finish', 'modern-space', 'walnut-desk', 'wood-detail',
      'workshop-details'
    ]
  );
  assert.equal(gallery.length, 3);
  assert.equal(new Set(gallery.map((asset) => asset.id)).size, gallery.length);
  assert.equal(new Set(gallery.map((asset) => asset.src)).size, gallery.length);

  for (const asset of Object.values(byId)) {
    const filename = decodeURIComponent(new URL(asset.src).pathname.split('/').pop());
    assert.ok(existsSync(path.join(__dirname, '..', 'public', 'img', filename)), `${asset.id} image exists`);
    assert.ok(asset.alt.length > 0, `${asset.id} has descriptive alternative text`);
  }
});

test('website and both admin entry points load the shared gallery data first', () => {
  const publicDir = path.join(__dirname, '..', 'public');
  const pages = [
    { file: 'index.html', nextScript: 'ms.js' },
    { file: 'admin.html', nextScript: 'admin.js' },
    { file: path.join('admin', 'index.html'), nextScript: 'admin.js' }
  ];

  for (const { file, nextScript } of pages) {
    const markup = readFileSync(path.join(publicDir, file), 'utf8');
    const sharedScript = markup.indexOf('gallery-assets.js');
    assert.ok(sharedScript >= 0, `${file} includes the shared gallery asset file`);
    assert.ok(sharedScript < markup.indexOf(nextScript), `${file} loads gallery data before ${nextScript}`);
  }
});
