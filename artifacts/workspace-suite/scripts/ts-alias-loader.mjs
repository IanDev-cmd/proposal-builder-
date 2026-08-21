import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function isFile(p) {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveToFile(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.json`,
    path.join(base, 'index.ts'),
  ];
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const file = resolveToFile(path.join(srcRoot, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const file = resolveToFile(path.resolve(parentDir, specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.json')) {
    const { readFileSync } = await import('node:fs');
    return {
      format: 'json',
      shortCircuit: true,
      source: readFileSync(new URL(url), 'utf8'),
    };
  }
  return nextLoad(url, context);
}
