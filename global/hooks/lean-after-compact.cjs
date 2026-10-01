#!/usr/bin/env node
// SessionStart(compact): compact 直後に作業状態（ブランチ・変更ファイル・直近コミット）を
// 数百トークンだけ再注入し、要約で失われがちな「今どこを触っているか」を補う。
const { execSync } = require("child_process");
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cwd = process.cwd();
  try { cwd = JSON.parse(raw || "{}").cwd || cwd; } catch {}
  const run = (c) => {
    try { return execSync(c, { cwd, timeout: 3000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true }).toString().trim(); }
    catch { return ""; }
  };
  const branch = run("git rev-parse --abbrev-ref HEAD");
  if (!branch) return; // git 管理外なら何もしない
  const status = run("git status --short").split("\n").filter(Boolean);
  const log = run("git log --oneline -5");
  const parts = [`[compact後の作業状態] ブランチ: ${branch}`];
  if (status.length) {
    parts.push(`未コミットの変更 ${status.length} 件${status.length > 30 ? "（先頭30件）" : ""}:`);
    parts.push(status.slice(0, 30).join("\n"));
  }
  if (log) parts.push("直近のコミット:\n" + log);
  process.stdout.write(parts.join("\n") + "\n");
});
