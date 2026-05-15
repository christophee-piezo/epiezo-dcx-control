import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const workspaceRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outdir = resolve(workspaceRoot, 'dist', 'renderer');

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(workspaceRoot, 'src', 'main.jsx')],
  bundle: true,
  outdir,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  target: ['es2022'],
  jsx: 'automatic',
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"'
  },
  entryNames: 'main',
  chunkNames: 'chunks/[name]-[hash]'
});
