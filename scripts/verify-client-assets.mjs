import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const assetManifestPath = resolve(projectRoot, "dist/server/vinext-client-assets.js");
const clientRoot = resolve(projectRoot, "dist/client");

if (!existsSync(assetManifestPath)) {
  throw new Error("Vinext のクライアントアセット一覧を生成できませんでした。");
}

const source = readFileSync(assetManifestPath, "utf8");
const paths = [...source.matchAll(/"(\/?_next\/static\/[^"\\]+)"/g)].map((match) => match[1]);
const missing = paths.filter((assetPath) => !existsSync(resolve(clientRoot, assetPath.replace(/^\//, ""))));

if (missing.length > 0) {
  throw new Error(`本番へ配置するクライアントファイルが不足しています: ${missing.join(", ")}`);
}

console.log(`Verified ${paths.length} Vinext client assets for Cloudflare deployment.`);
