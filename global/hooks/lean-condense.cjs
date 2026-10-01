#!/usr/bin/env node
// 標準入力のコマンド出力を要約する。短い出力はそのまま、長い出力は
// 「先頭・エラー周辺・末尾」だけ残す。ANSI 色コードは常に除去。終了コードは元コマンドのものを返す。
const PASS_THROUGH = 60;   // この行数以下なら全文を出す
const HEAD = 5, TAIL = 20, MAX_IMPORTANT = 120, AFTER = 3;
const IMPORTANT = /(error|fail|failed|failing|✗|✕|×|panic|exception|traceback|assert|expected|received|\bTS\d{4}\b|cannot find|not found|undefined|warning)/i;

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (buf += d));
process.stdin.on("end", () => {
  let code = 0;
  const m = buf.match(/(?:^|\n)__LEAN_EXIT=(\d+)\s*$/);
  if (m) { code = Number(m[1]); buf = buf.slice(0, m.index); }
  const text = buf.replace(/^\uFEFF/, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r(?!\n)/g, "\n");
  const lines = text.split(/\r?\n/);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (lines.length <= PASS_THROUGH) {
    process.stdout.write(lines.join("\n") + "\n");
    return process.exit(code);
  }
  const keep = new Set();
  for (let i = 0; i < Math.min(HEAD, lines.length); i++) keep.add(i);
  let important = 0;
  for (let i = 0; i < lines.length && important < MAX_IMPORTANT; i++) {
    if (IMPORTANT.test(lines[i])) {
      for (let j = i; j <= Math.min(i + AFTER, lines.length - 1); j++) {
        if (!keep.has(j)) { keep.add(j); important++; }
      }
    }
  }
  for (let i = Math.max(0, lines.length - TAIL); i < lines.length; i++) keep.add(i);

  const out = [];
  let prev = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i - prev > 1) out.push(`… (${i - prev - 1} 行省略) …`);
    out.push(lines[i]);
    prev = i;
  }
  out.push(`[lean-quiet] ${lines.length} 行 → ${keep.size} 行に要約（exit ${code}）。全文が必要なら先頭に LEAN_QUIET=0 を付けて再実行。`);
  process.stdout.write(out.join("\n") + "\n");
  process.exit(code);
});
