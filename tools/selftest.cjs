#!/usr/bin/env node
/*
 * lean-ops セルフテスト（macOS / Windows / Linux）
 *   node install.cjs --test   または   node tools/selftest.cjs
 * このマシンにあるシェル（Windows: PowerShell 5.1 / PowerShell 7 / Git Bash、
 * macOS: zsh / bash / sh / pwsh）すべてで、出力要約フックが実際に動くかを確かめる。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const HOOKS = path.join(ROOT, "global", "hooks");
const { decide, wrapPosix, wrapPowerShell } = require(path.join(HOOKS, "lean-quiet.cjs"));
const fwd = (p) => p.replace(/\\/g, "/");
const NODE = fwd(process.execPath);
const FILTER = fwd(path.join(HOOKS, "lean-condense.cjs"));
const WIN = process.platform === "win32";

let pass = 0, fail = 0;
const ok = (name, cond, detail = "") => {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✔" : "✘"} ${name}${!cond && detail ? `\n    ${detail}` : ""}`);
};

// 1) 書き換え判定（シェル非依存）
console.log("■ 書き換え判定");
const d = (tool, command) => decide({ tool_name: tool, tool_input: { command } }, NODE, FILTER);
for (const tool of ["Bash", "PowerShell"]) {
  ok(`${tool}: npm test は要約対象`, !!d(tool, "npm test"));
  ok(`${tool}: npx vitest run は要約対象`, !!d(tool, "npx vitest run src/a.test.ts"));
  ok(`${tool}: npm run dev は対象外`, d(tool, "npm run dev") === null);
  ok(`${tool}: 連結コマンドは対象外`, d(tool, "npm test && git push") === null);
  ok(`${tool}: パイプ付きは対象外`, d(tool, "npm test | tail") === null);
  ok(`${tool}: ls は対象外`, d(tool, "ls") === null);
}
ok("PowerShell: FOO=bar 形式は対象外", d("PowerShell", "CI=1 npm test") === null);

// 2) 実シェルでの実行
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lean-ops-"));
const fixture = path.join(tmp, "fixture.cjs");
fs.writeFileSync(fixture, [
  'for (let i = 1; i <= 300; i++) console.log(`\\x1b[32m✓\\x1b[0m テスト ${i} 成功`);',
  'console.log("FAIL src/utils.test.ts > 日付の整形");',
  'console.error("AssertionError: expected 1 to be 2");',
  "process.exit(3);",
].join("\n"));
const fx = fwd(fixture);

const exists = (p) => { try { return p && fs.existsSync(p); } catch { return false; } };
const which = (name) => {
  const r = spawnSync(WIN ? "where" : "which", [name], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).find((p) => p && !/\\Windows\\System32\\bash\.exe$/i.test(p)) || null;
};

const shells = [];
if (WIN) {
  shells.push({ name: "Windows PowerShell 5.1", kind: "ps", exe: "powershell.exe" });
  const pwsh = which("pwsh");
  if (pwsh) shells.push({ name: "PowerShell 7", kind: "ps", exe: pwsh });
  const gitBash = [process.env.CLAUDE_CODE_GIT_BASH_PATH, "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files (x86)\\Git\\bin\\bash.exe"].find(exists);
  if (gitBash) shells.push({ name: "Git Bash", kind: "sh", exe: gitBash });
  else console.log("（Git Bash なし: Claude Code は PowerShell ツールを使うので問題ありません）");
} else {
  for (const s of ["zsh", "bash", "sh"]) { const p = which(s); if (p) shells.push({ name: s, kind: "sh", exe: p }); }
  const pwsh = which("pwsh");
  if (pwsh) shells.push({ name: "PowerShell 7", kind: "ps", exe: pwsh });
}

console.log("\n■ 実シェルでの実行（300行の出力 → 要約、終了コード3が保たれるか）");
for (const sh of shells) {
  let r;
  if (sh.kind === "sh") {
    const script = path.join(tmp, `t-${sh.name.replace(/\W/g, "")}.sh`);
    fs.writeFileSync(script, wrapPosix(`"${NODE}" "${fx}"`, NODE, FILTER) + "\n");
    r = spawnSync(sh.exe, [script], { encoding: "utf8", timeout: 60000 });
  } else {
    const cmd = wrapPowerShell(`& "${NODE}" "${fx}"`, NODE, FILTER) + "; exit $LASTEXITCODE";
    const enc = Buffer.from(cmd, "utf16le").toString("base64");
    r = spawnSync(sh.exe, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], { encoding: "utf8", timeout: 60000 });
  }
  const out = (r.stdout || "") + (r.stderr || "");
  const summarized = out.includes("[lean-quiet]");
  const keptFail = out.includes("FAIL src/utils.test.ts");
  const utf8 = out.includes("テスト") && out.includes("日付の整形");
  const lines = out.trim().split(/\r?\n/).length;
  ok(`${sh.name}: 要約された（${lines}行）`, summarized && lines < 60, out.slice(0, 300));
  ok(`${sh.name}: 失敗行が残った`, keptFail);
  ok(`${sh.name}: 日本語が文字化けしない`, utf8);
  ok(`${sh.name}: 終了コード 3 が保たれた（実際: ${r.status}）`, r.status === 3, r.error ? String(r.error) : "");
}

// 3) compact 後フック
console.log("\n■ compact 後フック");
const ac = spawnSync(process.execPath, [path.join(HOOKS, "lean-after-compact.cjs")], { input: JSON.stringify({ cwd: ROOT }), encoding: "utf8", timeout: 15000 });
ok("エラーなく終了", ac.status === 0, ac.stderr);

// 4) 導入済みならインストール状態も確認
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const sp = path.join(CLAUDE_DIR, "settings.json");
if (exists(sp)) {
  console.log("\n■ インストール状態");
  try {
    const s = JSON.parse(fs.readFileSync(sp, "utf8"));
    const ours = (s.hooks?.PreToolUse || []).flatMap((g) => g.hooks.map((h) => ({ g, h }))).find(({ h }) => JSON.stringify(h.args || []).includes("lean-ops"));
    if (!ours) console.log("（まだ導入されていません: node install.cjs）");
    else {
      ok("PreToolUse の対象が Bash|PowerShell", ours.g.matcher === "Bash|PowerShell", `matcher: ${ours.g.matcher}（node install.cjs を再実行してください）`);
      ok(`フックの node が存在する（${ours.h.command}）`, exists(ours.h.command), "node install.cjs を再実行してください");
      ok("フックのスクリプトが存在する", exists(ours.h.args[0]));
    }
  } catch (e) { ok("settings.json を読めた", false, String(e)); }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n結果: ${pass} 件成功 / ${fail} 件失敗（${os.platform()} ${os.release()}, Node ${process.version}）`);
process.exitCode = fail ? 1 : 0;
