import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(path) {
	return readFileSync(join(root, path), 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const tauri = JSON.parse(read('src-tauri/tauri.conf.json'));
const cargo = read('src-tauri/Cargo.toml');
const cargoVer = cargo.match(/^version = "([^"]+)"/m)?.[1];

const versions = {
	'package.json': pkg.version,
	'tauri.conf.json': tauri.version,
	'Cargo.toml': cargoVer,
};

const uniq = new Set(Object.values(versions));
if (uniq.size !== 1 || !pkg.version) {
	console.error('Version mismatch:', versions);
	process.exit(1);
}

console.log(`version ${pkg.version} consistent`);
