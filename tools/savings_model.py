#!/usr/bin/env python3
"""Claude Code 1日あたりトークンコストの簡易シミュレーター（再現用）。

価格は 2026-09 時点の公式リスト価格（USD / 100万トークン）:
  Opus 5.5   : 入力 $4 / 出力 $20 / キャッシュ読み $0.20 / キャッシュ書き(5分) $5
  Sonnet 5.5 : 入力 $2 / 出力 $10 / キャッシュ読み $0.20 / キャッシュ書き(5分) $2.50
1時間キャッシュの書き込みは標準の 2倍（入力単価×2）と仮定。サブスクのメイン会話は1時間キャッシュ。
サブスクでも同じリクエストが同じだけ利用枠を消費する（公式ブログ）。

使い方: python3 tools/savings_model.py
"""
PRICES = {
    "opus-5.5":   dict(out=20.0, read=0.20, write_1h=8.0, write_5m=5.0),
    "sonnet-5.5": dict(out=10.0, read=0.20, write_1h=4.0, write_5m=2.50),
}

def day(*, model="opus-5.5", requests_per_task=40, tasks=6, base=25_000, new_per_req=3_000,
        out_per_req=600, appended_out_ratio=0.5, test_ratio=0.15, test_raw=6_000,
        test_filtered=800, filter_tests=False, autocompact=967_000,
        clear_between_tasks=False, cache_busts=2, summary=12_000):
    P = PRICES[model]
    W = P["write_1h"]
    cost = base * W / 1e6
    ctx, ctx_sum, n_req = base, 0, 0
    busts_at = {int(tasks * requests_per_task * f) for f in [0.35, 0.7][:cache_busts]}
    for t in range(tasks):
        if clear_between_tasks and t > 0:
            ctx = base
        for r in range(requests_per_task):
            n_req += 1
            is_test = (r % round(1 / test_ratio)) == 0
            new = (test_filtered if filter_tests else test_raw) if is_test else new_per_req
            cost += ctx * (W if n_req in busts_at else P["read"]) / 1e6
            cost += new * W / 1e6 + out_per_req * P["out"] / 1e6
            ctx += new + int(out_per_req * appended_out_ratio)
            ctx_sum += ctx
            if ctx >= autocompact:
                cost += ctx * P["read"] / 1e6 + summary * P["out"] / 1e6
                ctx = base + summary
                cost += summary * W / 1e6
    return cost, ctx_sum / n_req

KIT = dict(autocompact=200_000, filter_tests=True)
HABITS = dict(cache_busts=0, clear_between_tasks=True)

if __name__ == "__main__":
    for model in PRICES:
        a = day(model=model)[0]
        print(f"\n=== メイン: {model} ===")
        rows = [
            ("A 対策なし（1日1セッション, 切替・離席あり）", {}),
            ("B キット導入（自動のみ）", KIT),
            ("C B + 3つの習慣", {**KIT, **HABITS}),
        ]
        for label, kw in rows:
            c, avg = day(model=model, **kw)
            print(f"  {label:<34} ${c:6.2f}  {1-c/a:5.0%}  平均文脈 {avg/1000:4.0f}k")
        r0 = day(model=model, **HABITS)[0]
        r1 = day(model=model, **HABITS, **KIT)[0]
        print(f"  /clear 徹底済みの人への追加削減: {1-r1/r0:.0%}  (${r0:.2f} → ${r1:.2f})")

    print("\n=== 同じ使い方で Opus 5.5 → Sonnet 5.5 に替えた場合（トークン数は同じと仮定）===")
    for label, kw in [("対策なし", {}), ("キット+習慣", {**KIT, **HABITS})]:
        o = day(model="opus-5.5", **kw)[0]; s = day(model="sonnet-5.5", **kw)[0]
        print(f"  {label:<10} Opus ${o:6.2f} → Sonnet ${s:6.2f}  ({1-s/o:.0%} 減)")

    print("\n=== 感度分析: キット導入（自動のみ）の削減率, Opus 5.5 ===")
    for rpt in (20, 40, 60):
        for npr in (1500, 3000, 5000):
            a = day(requests_per_task=rpt, new_per_req=npr)[0]
            b = day(requests_per_task=rpt, new_per_req=npr, **KIT)[0]
            print(f"  リクエスト/タスク={rpt:>2}, 新規/リクエスト={npr:>5}: {1-b/a:4.0%}")

    print("\n=== 途中のモデル切替1回のコスト ===")
    for model, P in PRICES.items():
        for ctx in (100_000, 300_000):
            bust, read = ctx * P["write_1h"] / 1e6, ctx * P["read"] / 1e6
            print(f"  {model} 文脈{ctx//1000}k: ${bust:.2f}（通常ターン {bust/read:.0f} 回分）")

    sub = dict(new=60_000, out=8_000, reads=400_000)
    def sub_cost(m):
        P = PRICES[m]; return sub["new"]*P["write_5m"]/1e6 + sub["out"]*P["out"]/1e6 + sub["reads"]*P["read"]/1e6
    o, s = sub_cost("opus-5.5"), sub_cost("sonnet-5.5")
    print(f"\nサブエージェント1回（新規60k/出力8k/読み400k）: Opus 5.5 ${o:.2f} → Sonnet 5.5 ${s:.2f}（{1-s/o:.0%} 減）")
