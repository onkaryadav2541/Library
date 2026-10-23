import path from 'node:path';

// Compare paths using the host platform's separators, including Windows drives.
export function isWithinRoot(root, file, pathApi = path) {
  const relative = pathApi.relative(root, file);
  return relative !== '' && relative !== '..'
    && !relative.startsWith('..' + pathApi.sep)
    && !pathApi.isAbsolute(relative);
}
