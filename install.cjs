#!/usr/bin/env node
/*
 * claude-code-lean-ops installer（macOS / Windows / Linux 共通。Node 18+）
 * Windows は PowerShell・コマンドプロンプト・Git Bash のどれから実行してもよい。
 *   node install.cjs                 標準プロファイルを導入
 *   node install.cjs --saver         節約優先（main=Sonnet 5.5 + Opus 5.5 advisor）も設定
 *   node install.cjs --api-key       API キー利用者向けに 1時間キャッシュを設定
 *   node install.cjs --dry-run       変更内容を表示するだけ
 *   node install.cjs --uninstall     導入したものを取り除く
 *   node install.cjs --test          このマシンの全シェルで動作確認（導入前後どちらでも可）
 * 既存の ~/.claude/settings.json は必ずバックアップしてからマージする。既存の値は上書きしない。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const SRC = __dirname;
const HOOK_DIR = path.join(CLAUDE_DIR, "hooks", "lean-ops");
const SKILLS = ["brief", "go"];
const fwd = (p) => p.replace(/\\/g, "/");
const NODE = fwd(process.execPath);
const MARK_START = "<!-- lean-ops:start -->";
const MARK_END = "<!-- lean-ops:end -->";
const TAG = "lean-ops";

const MIN_VERSION = [2, 1, 284]; // Sonnet 5.5 対応（Opus 5.5 は 2.1.280〜）

function checkVersion() {
  try {
    const out = require("child_process").execSync("claude --version", { stdio: ["ignore", "pipe", "ignore"], timeout: 8000 }).toString();
    const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return;
    const v = m.slice(1, 4).map(Number);
    const older = v[0] - MIN_VERSION[0] || v[1] - MIN_VERSION[1] || v[2] - MIN_VERSION[2];
    if (older < 0) console.log(`⚠ Claude Code ${v.join(".")} を検出。Opus 5.5 / Sonnet 5.5 前提の設定です。先に \`claude update\` を推奨（${MIN_VERSION.join(".")} 以降）\n`);
  } catch { console.log("⚠ claude コマンドが見つからないためバージョン確認をスキップしました\n"); }
}

const log = (...m) => console.log(DRY ? "[dry-run]" : "•", ...m);
const write = (p, s) => { if (!DRY) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); } };
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

function loadSettings(p) {
  const raw = read(p);
  if (raw === null || raw.trim() === "") return {};
  try { return JSON.parse(raw); }
  catch { console.error(`✗ ${p} が JSON として読めません。手で直してから再実行してください。`); process.exit(1); }
}

function stripOurHooks(settings) {
  if (!settings.hooks) return;
  for (const ev of Object.keys(settings.hooks)) {
    settings.hooks[ev] = settings.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !JSON.stringify([h.command, h.args || []]).includes(`hooks/${TAG}/`)) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[ev].length) delete settings.hooks[ev];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
}

function setIfAbsent(obj, key, value, label) {
  if (obj[key] === undefined) { obj[key] = value; log(`${label} = ${JSON.stringify(value)}`); }
  else if (JSON.stringify(obj[key]) !== JSON.stringify(value)) log(`${label} は既存値 ${JSON.stringify(obj[key])} を維持（推奨: ${JSON.stringify(value)}）`);
}

const DEFAULTS = (saver, apiKey) => ({
  autoCompactWindow: 200000,
  outputStyle: "Concise",
  env: { CLAUDE_CODE_SUBAGENT_MODEL: "sonnet" },
  ...(saver ? { model: "sonnet", advisorModel: "opus" } : {}),
  ...(apiKey ? { promptCacheTtl: "1h" } : {}),
});

function install() {
  console.log(`Claude 設定ディレクトリ: ${CLAUDE_DIR}\n`);
  checkVersion();

  // 1) hooks
  for (const f of ["lean-quiet.cjs", "lean-condense.cjs", "lean-after-compact.cjs"]) {
    write(path.join(HOOK_DIR, f), fs.readFileSync(path.join(SRC, "global", "hooks", f)));
  }
  log(`hooks を ${HOOK_DIR} に配置`);

  // 2) skills（同名の他人のスキルは上書きしない）
  for (const s of SKILLS) {
    const dst = path.join(CLAUDE_DIR, "skills", s, "SKILL.md");
    const cur = read(dst);
    if (cur !== null && !cur.includes(TAG)) { log(`skills/${s} は既存の別スキルがあるためスキップ`); continue; }
    write(dst, fs.readFileSync(path.join(SRC, "skills", s, "SKILL.md")));
    log(`skills/${s} を配置（/${s}）`);
  }

  // 3) CLAUDE.md（マーカー区間だけを差し替え。既存の内容は残す）
  const mdPath = path.join(CLAUDE_DIR, "CLAUDE.md");
  const block = fs.readFileSync(path.join(SRC, "global", "CLAUDE.md"), "utf8").trim();
  const wrapped = `${MARK_START}\n${block}\n${MARK_END}`;
  const cur = read(mdPath) || "";
  const re = new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`);
  const next = re.test(cur) ? cur.replace(re, wrapped) : (cur.trim() ? `${cur.trimEnd()}\n\n${wrapped}\n` : `${wrapped}\n`);
  write(mdPath, next);
  log(`CLAUDE.md にブロックを${re.test(cur) ? "更新" : "追記"}`);

  // 4) settings.json（バックアップ → マージ）
  const sp = path.join(CLAUDE_DIR, "settings.json");
  if (fs.existsSync(sp) && !DRY) {
    const bak = `${sp}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(sp, bak);
    log(`settings.json をバックアップ → ${path.basename(bak)}`);
  }
  const s = loadSettings(sp);
  const d = DEFAULTS(args.has("--saver"), args.has("--api-key"));
  if (args.has("--saver") && s.model !== undefined && s.model !== "sonnet") {
    log(`--saver 指定のため model を ${JSON.stringify(s.model)} → "sonnet" に変更（Opus main + Opus advisor の二重課金を避けるため）`);
    s.model = "sonnet";
  }
  for (const [k, v] of Object.entries(d)) {
    if (k === "env") { s.env = s.env || {}; for (const [ek, ev] of Object.entries(v)) setIfAbsent(s.env, ek, ev, `env.${ek}`); }
    else setIfAbsent(s, k, v, k);
  }
  stripOurHooks(s);
  s.hooks = s.hooks || {};
  // exec 形式（args あり）= シェルを介さず node を直接起動。Mac の sh / Windows の Git Bash・PowerShell・cmd
  // のどれがフック実行に使われても同じ動きになる。node は今このインストーラーを動かしている実体の絶対パス
  // （デスクトップアプリ起動などで PATH に node が無い場合も動くように）。
  const hook = (f) => ({ type: "command", command: NODE, args: [fwd(path.join(HOOK_DIR, f))], timeout: 10 });
  (s.hooks.PreToolUse = s.hooks.PreToolUse || []).push({ matcher: "Bash|PowerShell", hooks: [hook("lean-quiet.cjs")] });
  (s.hooks.SessionStart = s.hooks.SessionStart || []).push({ matcher: "compact", hooks: [hook("lean-after-compact.cjs")] });
  write(sp, JSON.stringify(s, null, 2) + "\n");
  log(`hooks を settings.json に登録（PreToolUse:Bash|PowerShell / SessionStart:compact、node: ${NODE}）`);
  if (/[\\/](\.nvm|\.volta|fnm|\.asdf|mise)[\\/]/i.test(NODE)) {
    log("node がバージョン管理ツール配下です。そのバージョンを削除した場合は、このインストーラーを再実行してください");
  }

  console.log(`\n完了。Claude Code を再起動し、/hooks と /context で確認してください。`);
}

function uninstall() {
  const sp = path.join(CLAUDE_DIR, "settings.json");
  const s = loadSettings(sp);
  stripOurHooks(s);
  const ours = { autoCompactWindow: 200000, outputStyle: "Concise", advisorModel: "opus", promptCacheTtl: "1h" };
  for (const [k, v] of Object.entries(ours)) if (s[k] === v) { delete s[k]; log(`${k} を削除`); }
  if (s.env && s.env.CLAUDE_CODE_SUBAGENT_MODEL === "sonnet") { delete s.env.CLAUDE_CODE_SUBAGENT_MODEL; log("env.CLAUDE_CODE_SUBAGENT_MODEL を削除"); }
  if (s.env && !Object.keys(s.env).length) delete s.env;
  if (s.model === "sonnet") log("model = sonnet は残しています（不要なら /model で変更）");
  if (fs.existsSync(sp)) write(sp, JSON.stringify(s, null, 2) + "\n");
  const mdPath = path.join(CLAUDE_DIR, "CLAUDE.md");
  const md = read(mdPath);
  if (md) write(mdPath, md.replace(new RegExp(`\\n*${MARK_START}[\\s\\S]*?${MARK_END}\\n?`), "\n").trimStart());
  for (const sk of SKILLS) {
    const p = path.join(CLAUDE_DIR, "skills", sk, "SKILL.md");
    const c = read(p);
    if (c && c.includes(TAG) && !DRY) fs.rmSync(path.dirname(p), { recursive: true, force: true });
  }
  if (!DRY) fs.rmSync(HOOK_DIR, { recursive: true, force: true });
  log("hooks / skills / CLAUDE.md ブロックを削除しました");
}

if (args.has("--test")) require(path.join(SRC, "tools", "selftest.cjs"));
else if (args.has("--uninstall")) uninstall();
else install();
