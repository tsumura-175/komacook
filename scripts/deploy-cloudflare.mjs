import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const vinextCli = fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url));
const cloudflareCli = fileURLToPath(new URL("../node_modules/@vinext/cloudflare/dist/cli.js", import.meta.url));
const generatedConfig = fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url));

// vinextが生成するwrangler.jsonには、元のwrangler.jsoncのkeep_varsが
// 引き継がれない。明示しておかないと、ダッシュボードで設定した送信先や
// Secret以外のVariableが次回のデプロイで失われる。
execFileSync(process.execPath, [vinextCli, "build"], { cwd: projectRoot, stdio: "inherit" });
const config = JSON.parse(readFileSync(generatedConfig, "utf8"));
config.keep_vars = true;
writeFileSync(generatedConfig, `${JSON.stringify(config, null, 2)}\n`);
execFileSync(process.execPath, [cloudflareCli, "deploy", "--config", generatedConfig, "--skip-build"], { cwd: projectRoot, stdio: "inherit" });
