/**
 * Windows only. Native builds of React Native need a SHORT path (Windows stops at 260 characters), so the build is run
 * from a drive letter made with `subst`. Metro (the JavaScript bundler) gets confused by such a drive, so Gradle calls
 * this wrapper instead of the CLI directly: it turns the short paths back into the real ones and runs the real CLI
 * from the real folder. It does nothing unless LT_REAL_ROOT is set (see scripts/build-android-windows.ps1).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const real = process.env.LT_REAL_ROOT;
const short = process.env.LT_SHORT_ROOT || 'L:' + path.sep;
const args = process.argv.slice(2).map((a) => (real && a.toLowerCase().startsWith(short.toLowerCase()) ? path.join(real, a.slice(short.length)) : a));
const root = real || process.cwd();
const cli = path.join(root, 'node_modules', 'react-native', 'cli.js');
const r = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', cwd: root });
process.exit(r.status === null ? 1 : r.status);
