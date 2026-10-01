#!/usr/bin/env node
// PreToolUse(Bash|PowerShell): テスト/ビルド/lint 系の「単純な1コマンド」だけを書き換え、
// 出力を lean-condense.cjs に通して要点だけを会話に残す。該当しなければ何もしない。
//   - Bash ツール（macOS / Linux / Windows の Git Bash）→ POSIX 構文で包む
//   - PowerShell ツール（Windows。PowerShell 7 / 5.1）→ PowerShell 構文で包む
// 無効化: 環境変数 LEAN_QUIET=0、またはコマンド先頭に LEAN_QUIET=0 を付ける。
const path = require("path");

const NOISY = [
  /^(npm|pnpm|yarn|bun)(\.cmd)?\s+(run\s+)?(test|build|lint|typecheck|type-check|check|e2e)([:\s]|$)/i,
  /^(npx|bunx|pnpm\s+exec|pnpm\s+dlx)(\.cmd)?\s+(--yes\s+)?(vitest|jest|tsc|eslint|playwright\s+test|next\s+(build|lint)|biome\s+(check|lint)|prettier\s+--check)\b/i,
  /^(vitest|jest|tsc|eslint|pytest|python3?\s+-m\s+pytest|py\s+-m\s+pytest|go\s+(test|build|vet)|cargo\s+(test|build|check|clippy)|next\s+build)\b/i,
];
// パイプ・連結・リダイレクト・変数展開・エスケープ文字（bash の \ と PowerShell の `）を含むものは触らない
const UNSAFE = /[|&;<>`$\\\n\r]/;
const LONG_RUNNING = /(--watch\b|\bwatch\b|\bdev\b|\bserve\b|\bstart\b|--ui\b)/i;

const fwd = (p) => p.replace(/\\/g, "/");

function wrapPosix(cmd, node, filter) {
  // sh / bash / zsh / Git Bash 共通。終了コードはマーカー経由で filter が引き継ぐ
  return `{ ${cmd}; echo "__LEAN_EXIT=$?"; } 2>&1 | "${node}" "${filter}"`;
}

function wrapPowerShell(cmd, node, filter) {
  // PowerShell 7 / 5.1 共通。UTF-8 で node に渡し、stderr も文字列化して合流、
  // 最後の native コマンド（node）の終了コード = 元コマンドの終了コードになる
  return [
    // 5.1 は既定が ASCII / 日本語環境の Shift-JIS(932) なので、node への入力・node からの出力とも UTF-8 に固定
    "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    `& { $ErrorActionPreference = 'Continue'; $global:LASTEXITCODE = 0; ${cmd} 2>&1 | ForEach-Object { "$_" }; "__LEAN_EXIT=$LASTEXITCODE" } | & "${node}" "${filter}"`,
  ].join("; ");
}

// フック入力（JSON）から、書き換え後のコマンドを返す。書き換えないときは null。
function decide(input, node = fwd(process.execPath), filter = fwd(path.join(__dirname, "lean-condense.cjs"))) {
  if (process.env.LEAN_QUIET === "0") return null;
  const ti = input.tool_input || {};
  const cmd = String(ti.command || "").trim();
  if (!cmd || ti.run_in_background) return null;
  if (/\bLEAN_QUIET=0\b/.test(cmd)) return null;
  const body = cmd.replace(/^(\w+=\S*\s+)+/, ""); // 先頭の FOO=bar を除いて判定
  if (UNSAFE.test(cmd) || LONG_RUNNING.test(body)) return null;
  if (!NOISY.some((re) => re.test(body))) return null;
  const isPS = String(input.tool_name || "") === "PowerShell";
  if (isPS && body !== cmd) return null; // PowerShell では FOO=bar 形式は使えないので触らない
  return isPS ? wrapPowerShell(cmd, node, filter) : wrapPosix(cmd, node, filter);
}

module.exports = { decide, wrapPosix, wrapPowerShell };
if (require.main !== module) return;

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(raw || "{}");
    const wrapped = decide(input);
    if (!wrapped) return;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: "lean-quiet: 出力を要約して実行",
        updatedInput: { ...(input.tool_input || {}), command: wrapped },
      },
    }));
  } catch {
    // 失敗時は何もしない（元のコマンドがそのまま通常の許可フローで実行される）
  }
});
