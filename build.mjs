import { mkdir, copyFile, rm } from 'node:fs/promises';
const files = ['index.html', 'styles.css', 'app.mjs', 'model.mjs', 'storage.mjs', 'icons.mjs', 'favicon.svg'];
await rm(new URL('./dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
for (const name of files) await copyFile(new URL(name, import.meta.url), new URL(`dist/${name}`, import.meta.url));
console.log(`Static preview built: dist/ (${files.length} files).`);
