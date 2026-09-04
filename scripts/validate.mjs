import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedMatches = [
  "https://*.pricerunner.se/*",
  "https://*.pricerunner.dk/*",
  "https://*.pricerunner.no/*",
  "https://*.pricerunner.fi/*",
  "https://*.pricerunner.com/*",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, "manifest_version must remain 3");
assert(manifest.version === "2.0.0", "manifest version must be 2.0.0");
assert(JSON.stringify(manifest.permissions) === JSON.stringify(["storage"]), "only storage permission is allowed");
assert(!manifest.host_permissions, "host_permissions must not be added");
assert(
  JSON.stringify(manifest.content_scripts?.[0]?.matches) === JSON.stringify(expectedMatches),
  "content script matches differ from supported HTTPS domains",
);

const runtimeFiles = new Set([
  manifest.action.default_popup,
  manifest.background?.service_worker,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action.default_icon ?? {}),
]);
for (const contentScript of manifest.content_scripts ?? []) {
  for (const file of [...(contentScript.js ?? []), ...(contentScript.css ?? [])]) runtimeFiles.add(file);
}

for (const relativeFile of runtimeFiles) {
  assert(fs.existsSync(path.join(root, relativeFile)), `missing runtime file: ${relativeFile}`);
}

const scannableFiles = [
  "background.js",
  "core.js",
  "page-parser.js",
  "content.js",
  ...fs.readdirSync(path.join(root, "dist", "assets"))
    .filter((file) => /\.(?:js|css)$/.test(file))
    .map((file) => path.join("dist", "assets", file)),
];
for (const relativeFile of scannableFiles) {
  const source = fs.readFileSync(path.join(root, relativeFile), "utf8");
  assert(!/\beval\s*\(/.test(source), `eval found in ${relativeFile}`);
  assert(!/\bnew\s+Function\s*\(/.test(source), `new Function found in ${relativeFile}`);
  assert(!/<script[^>]+https?:\/\//i.test(source), `remote script found in ${relativeFile}`);
}

console.log(`Validated Manifest V3 package with ${runtimeFiles.size} referenced runtime files.`);
