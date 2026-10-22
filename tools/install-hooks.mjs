// node tools/install-hooks.mjs : once per clone. Installs a git pre-commit hook that stamps index.html
// (tools/stamp.mjs) so every commit you push to GitHub Pages loads fresh files in everyone's browser.
import fs from 'fs';
const hook = '#!/bin/sh\n# Skyward Aces: stamp index.html with the files\' content hashes (tools/stamp.mjs)\nnode tools/stamp.mjs >/dev/null && git add index.html\n';
fs.writeFileSync('.git/hooks/pre-commit', hook, { mode: 0o755 });
console.log('pre-commit hook installed');
