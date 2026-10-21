// Sets Cookbook's version everywhere it is written: npm run set-version -- 0.1.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run set-version -- 1.2.3');
  process.exit(1);
}

const json = (path, edit) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  edit(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
};
json('package.json', (p) => (p.version = version));
json('src-tauri/tauri.conf.json', (c) => (c.version = version));
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
writeFileSync('src-tauri/Cargo.toml', cargo.replace(/^version = ".*"$/m, `version = "${version}"`));
console.log(`Cookbook is now version ${version}. Update package-lock.json and Cargo.lock with: npm install && cargo check --manifest-path src-tauri/Cargo.toml`);
