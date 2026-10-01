# claude-code-lean-ops

[![selftest](https://github.com/Icchaso/claude-code-lean-ops/actions/workflows/selftest.yml/badge.svg)](https://github.com/Icchaso/claude-code-lean-ops/actions/workflows/selftest.yml)

Claude Code を **品質を落とさずに、自動でトークン節約させる** ための設定キットです。
**Claude Opus 5.5 / Sonnet 5.5 世代（2026年9月リリース）** の料金体系と挙動を前提に設計しています。

**macOS と Windows の両方に対応**（Windows は PowerShell 5.1 / PowerShell 7 / Git Bash のどれで Claude Code が動いていても有効）。Linux でも動きます。導入コマンドは全 OS 共通です。

## かんたん導入（3通り。どれか1つ）

**① Claude Code に貼るだけ（いちばん簡単）**

Claude Code を開いて、次の文をそのまま貼って送信します。

```text
https://github.com/Icchaso/claude-code-lean-ops をホームフォルダの claude-code-lean-ops に clone して、その中で node install.cjs を実行して。終わったら node install.cjs --test も実行して、結果を教えて。
```

**② ターミナルで打つ**

```bash
git clone https://github.com/Icchaso/claude-code-lean-ops.git
cd claude-code-lean-ops
node install.cjs          # 導入
node install.cjs --test   # このマシンの全シェルで動作確認
```

**③ git が入っていない場合**

このページ上部の緑の **Code** ボタン → **Download ZIP** で保存して展開し、展開したフォルダの中で `node install.cjs` を実行します。

どの方法でも、導入後に **Claude Code を再起動** すれば有効になります。元に戻すときは同じフォルダで `node install.cjs --uninstall` です（設定は導入前に自動でバックアップされます）。必要なのは [Node.js 18 以降](#前提) だけです。

- **自動で効くもの**: auto-compact を 200k に制限 / テスト・ビルド出力の自動要約 / サブエージェントを Sonnet 5.5 で実行 / 簡潔な出力スタイル / compact 後の作業状態の再注入
- **期待値（試算）**: 1つのセッションを長く使い回す人は **約57〜64%減**（条件により27〜63%以上）。すでに `/clear` を徹底している人は **約16%減**
- **一番大事な発見**: 5.5世代は Opus と Sonnet の **キャッシュ読み込み単価が同じ**。だから **モデルを安くするより、文脈を小さく保つ方が効く**（[詳細](#55世代で何が変わったか)）
- **人がやること**: 3つだけ（[運用](#運用人がやるのは3つだけ)）

> この分野の「正解」は数ヶ月で変わります（Haiku 5.5 も近日公開予定と発表済み）。モデル世代が変わったら見直してください。

---

## 5.5世代で何が変わったか

### 公式価格（100万トークンあたり）

| | Opus 5.5 | Sonnet 5.5 |
|---|---|---|
| 入力 | $4 | $2 |
| 出力（思考を含む） | $20 | $10 |
| キャッシュ書き込み | $5 | $2.50 |
| **キャッシュ読み込み** | **$0.20** | **$0.20** |
| Claude Code での既定 effort | medium | medium |

Claude Code のコストの大半は「毎ターン履歴を読み直すキャッシュ読み込み」です（公式によれば入力:出力の比率は 324:1 まで拡大）。その単価が同じなので、次のことが言えます。

1. **文脈のサイズ管理が最大の節約手段**。同じ使い方のまま Opus 5.5 → Sonnet 5.5 に替えても、文脈が膨らんでいると **22%減** にとどまる。文脈を絞った後なら替えた効果は **34%減** に広がる（試算）
2. **既定は Opus 5.5（medium）でよい**。すべてのプランで既定モデル。Anthropic のテストでは medium で Opus 5 の high と同等以上
3. **Sonnet 5.5 は「範囲が明確な日常タスク・バグ修正」向け**。公式は「低〜中 effort で使うと Opus 5.5 を最もよく補完し、高い effort では同程度のコストになる」としている。複雑で判断が要る仕事は Opus 5.5 がはっきり強い
4. **effort は途中で変えてもよい**。Opus 5.5 / Sonnet 5.5 は API キーかサブスクで使う限り、途中で `/effort` を変えてもキャッシュが残る（Bedrock・Google Cloud などでは作り直しになる）。高くつくのはモデルの切替の方
5. **モデルの途中切替は高い**。1回で通常ターン約40回分（Opus 5.5）/ 約20回分（Sonnet 5.5）のコスト
6. **Sonnet 5.5 はサイバーセキュリティ系の高リスク要求で Sonnet 5 に自動フォールバック** する（＝モデル切替が起きる）。セキュリティ診断が中心の作業では留意

### このキットでの使い分け

| セッションの種類 | 起動方法 | 理由 |
|---|---|---|
| 設計・原因不明のバグ・大きなリファクタ | `claude`（既定の Opus 5.5） | 判断の質が結果を左右する |
| 範囲が明確な実装・修正・ドキュメント作成 | `claude --model sonnet` | 新規入力と出力が半額。速度も30%以上速い |
| 長時間の作業で要所だけ強い判断が欲しい | `node install.cjs --saver` で Sonnet 5.5 + Opus 5.5 advisor | Sonnet が実行し、要所だけ Opus に相談（キャッシュを壊さない） |

モデルは **セッションごとに起動時に決める** のがコツです。公式ドキュメントも「複数のターミナルで別々のモデルを使うなら、`/model` で切り替えずに各ターミナルを `--model` で起動する」としています。並列セッション運用と相性が良いです。

起動を楽にするエイリアス（任意）:

```bash
# macOS: ~/.zshrc（bash なら ~/.bashrc）
alias co='claude'                  # Opus 5.5（既定）
alias cs='claude --model sonnet'   # Sonnet 5.5
```

```powershell
# Windows: notepad $PROFILE で開いて追記
function co { claude @args }
function cs { claude --model sonnet @args }
```

---

## 期待できる削減量

### シナリオ別（1日あたりの試算、API リスト価格換算）

| 使い方 | メイン Opus 5.5 | メイン Sonnet 5.5 |
|---|---|---|
| A. 対策なし（1日1セッション、途中でモデル切替・長い離席あり） | $40.2 | $31.4 |
| B. キット導入（自動のみ） | $17.4（**−57%**） | $11.5（**−64%**） |
| C. B ＋ 下記「3つの習慣」 | $12.2（**−70%**） | $8.1（**−74%**） |
| すでに `/clear` 徹底済みの人がキットを入れた場合 | **−16%** | **−16%** |

- **サブスクリプション（Pro / Max）でも、同じリクエストが同じだけ利用枠を消費します**（公式ブログ）。削減率は「上限に達しにくくなる度合い」の目安になります
- 条件を変えた感度分析では、自動部分だけで **27〜63%**（1タスクあたりのリクエスト数・読み込み量で変動）
- 計算は [`tools/savings_model.py`](tools/savings_model.py) で再現できます。前提を自分の使い方に合わせて変えてください

### 仕組みごとの内訳

| 仕組み | 自動 | 試算効果 | 根拠 |
|---|---|---|---|
| auto-compact を 200k に制限 | ✅ | 長時間型 **−51%** / `/clear` 徹底型 ±0% | 毎リクエストで履歴全体を再送する仕組み。Opus 5.5 / Sonnet 5.5 は 1M コンテキストで、既定では約967kまで compact しない。公式ブログが `/autocompact 200k` を紹介 |
| テスト・ビルド出力の自動要約 | ✅ | **−16〜19%** | 30,000文字未満の出力（例: 400行のパス表示）が以後の全ターンに残ることを公式ブログが問題視。公式ドキュメントに同趣旨のフック例あり |
| サブエージェントを Sonnet 5.5 で実行 | ✅ | 1回あたり **約−43%** | 公式が定型的なサブエージェントには小さいモデルを推奨。出力・書き込み単価が半額 |
| 出力スタイル Concise | ✅ | 出力テキスト減（金額は小） | 公式の組み込みスタイル。前置き・経過説明・まとめを省き、作業の丁寧さは Default と同じ |
| compact 後に作業状態を再注入 | ✅ | 品質維持（+数百トークン） | compact で失われやすい「今どこを触っているか」を git から補う |
| モデルは起動時に決める | 習慣 | 途中切替1回 = 通常ターン **20〜40回分** | モデルごとにキャッシュが別。切替時は全履歴を再書き込み |
| 作業を変えるとき `/clear` | 習慣 | 追加で約 **−13〜20%** | 公式ベストプラクティスの最重要項目 |
| Advisor（`--saver`） | 任意 | 公式数値: 精度 **+2.7pt**、1タスクあたり **−11.9%** | 実行は Sonnet、判断の要所だけ Opus。ただし公式数値は Sonnet 4.6 / Opus 4.6 時点の計測で、5.5世代の組み合わせでの公式数値は未公表 |

### 前提と限界（正直に）

- これは **モデルによる試算** で、実測ではありません。前提: 1日6タスク × 40リクエスト、1リクエストあたり新規3,000トークン・出力600トークン、テスト/ビルド実行が15%で1回6,000トークン、途中のモデル切替と1時間超の離席が1回ずつ。1時間キャッシュの書き込みは入力単価の2倍と仮定
- 「Opus → Sonnet で22〜34%減」は **同じトークン数を使う** と仮定した値です。公式は Sonnet 5.5 が Sonnet 5 よりタスクあたり最大30%安いとしていますが、Opus 5.5 とのタスクあたりトークン数の比較は公表されていません。逆に、難しいタスクでは Sonnet が試行錯誤してかえって高くつくこともあります
- auto-compact を早めると **要約で細部が失われる** リスクがあります。長い1タスクで品質が落ちると感じたら `/autocompact 400k` に上げてください
- 実際の削減は使い方次第です。[効果測定](#効果測定) で導入前後を比べてください

---

## 何が入るか

```
~/.claude/
├── CLAUDE.md                 ← 末尾に数行だけ追記（日本語出力・compact 時に残すもの）
├── settings.json             ← 既存値は上書きせずマージ（自動バックアップ）
├── hooks/lean-ops/
│   ├── lean-quiet.cjs        ← テスト/ビルド/lint のコマンドを要約付きで実行
│   ├── lean-condense.cjs     ← 出力を「先頭・エラー周辺・末尾」に圧縮（終了コードは維持）
│   └── lean-after-compact.cjs← compact 直後にブランチ・変更ファイル・直近コミットを再注入
└── skills/
    ├── brief/  → /brief      着手前のインタビュー → SPEC.md
    └── go/     → /go         検証 → 簡素化 → 独立レビュー → 報告 → コミット
```

`settings.json` に入る値（パスは OS ごとに自動で埋まります）:

```json
{
  "autoCompactWindow": 200000,
  "outputStyle": "Concise",
  "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet" },
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash|PowerShell",
      "hooks": [{ "type": "command", "command": "<node の絶対パス>", "args": ["<~/.claude>/hooks/lean-ops/lean-quiet.cjs"] }]
    }],
    "SessionStart": [{
      "matcher": "compact",
      "hooks": [{ "type": "command", "command": "<node の絶対パス>", "args": ["<~/.claude>/hooks/lean-ops/lean-after-compact.cjs"] }]
    }]
  }
}
```

フックは **exec 形式**（`args` 付き）で登録します。シェルを介さず node を直接起動するため、フックの実行に macOS の sh、Windows の Git Bash・PowerShell・cmd のどれが使われても同じように動きます。node は絶対パスで登録するので、デスクトップアプリから起動して PATH に node が無い場合でも動きます。

- `model` と effort は **設定しません**（公式の既定 = Opus 5.5 / medium を使う）。`--saver` のときだけ `"model": "sonnet"` と `"advisorModel": "opus"` を追加します
- `sonnet` / `opus` はエイリアスなので、Anthropic API では自動的に Sonnet 5.5 / Opus 5.5 に解決されます（Bedrock などは解決先が異なります）

### 出力要約フックの動き

Claude がどのシェルツールでコマンドを実行するかに合わせて、書き換え方を切り替えます。

| Claude Code が使うツール | 主な環境 | 書き換え後 |
|---|---|---|
| Bash ツール | macOS（zsh）、Linux、Windows の Git Bash | `{ npm test; echo "__LEAN_EXIT=$?"; } 2>&1 \| "node" "lean-condense.cjs"` |
| PowerShell ツール | Windows（PowerShell 7 / 5.1） | `& { npm test 2>&1 \| ForEach-Object { "$_" }; "__LEAN_EXIT=$LASTEXITCODE" } \| & "node" "lean-condense.cjs"`（UTF-8 固定付き） |

```
npm test（404行の出力）
  ↓ フックが自動で書き換え
  ↓ Claude に届くのは
先頭5行 … (379行省略) … 末尾20行（失敗箇所を含む）
[lean-quiet] 404 行 → 25 行に要約（exit 1）。全文が必要なら先頭に LEAN_QUIET=0 を付けて再実行。
```

安全のための制約:
- 対象は `npm test` / `npm run build` / `npx vitest` / `tsc` / `eslint` / `pytest` / `go test` / `cargo test` などの **単純な1コマンドだけ**。パイプ・`&&`・`;`・リダイレクト・変数展開を含むコマンドや、`dev` / `watch` / `serve` 系には触れません
- 60行以下の出力は全文そのまま。ANSI の色コードは常に除去
- 終了コードは元のコマンドのものを返すので、失敗の判定は変わりません
- 対象コマンドは公式ドキュメントの例と同じく `permissionDecision: "allow"` で実行されます（設定の deny / ask ルールは引き続き優先されます）
- Windows PowerShell 5.1 は既定の文字コードが ASCII / Shift-JIS のため、書き換え時に UTF-8 に固定して日本語の文字化けを防ぎます

---

## インストール

### 前提

| | macOS | Windows |
|---|---|---|
| Claude Code | v2.1.284 以降（`claude update`） | 同左 |
| Node.js 18 以降 | `brew install node` など | `winget install OpenJS.NodeJS.LTS` など |
| Git | 任意（compact 後フックが使う） | 任意。Git Bash も **不要**（PowerShell だけで動く） |

Claude Code のバージョンが古いとインストーラーが警告します。

```bash
node install.cjs              # 標準（メインは既定の Opus 5.5）
node install.cjs --dry-run    # 何が変わるか確認だけ
node install.cjs --saver      # 節約優先: メイン Sonnet 5.5 ＋ 要所だけ Opus 5.5 に相談（advisor）
node install.cjs --api-key    # API キー利用者: メイン会話のキャッシュを1時間に（サブスクは既定で1時間）
node install.cjs --uninstall  # 元に戻す
node install.cjs --test       # 全シェルで動作確認（導入前後どちらでも可）
```

Windows も同じコマンドです（PowerShell・コマンドプロンプト・Git Bash のどこから実行しても可）。

導入後、まずセルフテストを実行します。

```bash
node install.cjs --test
```

このマシンにあるすべてのシェル（Windows: PowerShell 5.1 / PowerShell 7 / Git Bash、macOS: zsh / bash / sh / pwsh）で、「出力が要約される」「失敗行が残る」「日本語が文字化けしない」「終了コードが保たれる」を実際に確かめ、導入状態（フックの対象・node の場所）も点検します。すべて ✔ なら OK です。

続いて Claude Code を再起動し、次を確認します。

1. 起動ヘッダーに `Opus 5.5 with medium effort`（`--saver` なら Sonnet 5.5）と出る
2. `/hooks` に PreToolUse（Bash）と SessionStart（compact）が出る
3. `/config` の出力スタイルが Concise
4. 任意のプロジェクトで「テストを実行して」と頼み、結果の最後に `[lean-quiet]` の行が出る

**Mac と Windows の2台で使う場合**: このリポジトリを各マシンで clone して `node install.cjs` するだけです。フックのパスと node の場所はマシンごとに自動で解決されるので、設定ファイルを共有・コピーする必要はありません。更新は `git pull` → `node install.cjs` です。

### OS 別の注意

| 症状 | 対処 |
|---|---|
| nvm / volta / fnm などで node のバージョンを切り替えた・消した | `node install.cjs` を再実行（登録した node の絶対パスを更新） |
| `/hooks` に出るのに要約されない | `node install.cjs --test` で ✘ の項目を確認 |
| WSL の中で Claude Code を使っている | WSL 内で clone・導入する（Linux として動作） |
| Windows でプロジェクトのパスに日本語やスペースがある | 対応済み（exec 形式のため引用符の問題が起きない） |

### 検証状況

- GitHub Actions で **macOS / Windows / Linux × Node 18・22** の実機ランナー上で、全シェルのセルフテストと導入→再導入→削除を毎回実行しています（上のバッジ）
- Windows PowerShell 5.1 での Claude Code 本体との組み合わせは、日本語ロケールの実機で `--test` を実行して確認してください。結果の Issue 報告を歓迎します

---

## 運用（人がやるのは3つだけ）

| いつ | やること | 理由 |
|---|---|---|
| 別の作業に移るとき | `/clear`（後で戻るなら先に `/rename 名前`） | 前の作業の文脈が毎ターン再送され続けるのを止める。最も効果が大きい |
| セッションを始めるとき | モデルを決める（`co` / `cs`）。途中で変えたくなったら `/clear` の直後に | 途中の切替は全履歴のキャッシュを作り直す |
| 1時間以上離れる前 | `/compact` | キャッシュが切れた後の compact は全履歴を定価で読み直すため高い |

**難しい箇所に当たったとき**: どちらのモデルでも `/effort high` に上げてかまいません（キャッシュが残る）。Sonnet 5.5 で effort を上げても行き詰まったら、モデルを途中で替えるより `/advisor opus` か、`/clear` してから Opus で起動し直す方が安く済みます。

これ以外は自動です。必要なときだけ使うスキル:

- **`/brief 作りたいもの`** … 中〜大規模の機能の前に、インタビューで仕様を固めて `SPEC.md` を作る。その後 `/clear` → `@SPEC.md を実装して /go`。設計を Opus 5.5 で固め、実装を Sonnet 5.5 のセッションに渡す使い方もできます
- **`/go`** … 実装の仕上げ（検証 → 簡素化 → サブエージェントによる独立レビュー → 報告 → コミット）

どちらも手動専用（`disable-model-invocation: true`）なので、**呼ぶまで説明文すらコンテキストに載らず、入れておくコストはゼロ** です。

### プロジェクト側でやること

`project-template/CLAUDE.md` を各リポジトリ直下にコピーし、実際のコマンドに書き換えます。ポイントは **よく使うコマンドを「静かなフラグ込み」で書く** ことと、**コードを読めば分かることは書かない** ことです。既存の CLAUDE.md がある場合は `/doctor` が削減案を出してくれます。

### 迷ったときの判断

- 結果がおかしい → まず文脈（指示の具体性・CLAUDE.md・接続ツール）を疑う
- 文脈は十分なのに間違えた → より強いモデルへ（Sonnet 5.5 → Opus 5.5。`/clear` 後に切替、または `/advisor opus`）
- ファイルを読み飛ばした・テストを走らせなかった → effort を上げる
- 同じ指摘を2回しても直らない → `/rewind`（Esc 2回）で戻ってから、学んだことを入れて指示し直す

（公式ブログ「Choosing a Claude model and effort level in Claude Code」の判断基準に沿っています）

---

## 効果測定

| 方法 | 見るところ |
|---|---|
| `/usage` | `Prompt cache (main)` 行のキャッシュ率とミス回数。下部の内訳で「long context」「cache misses」が10%以上なら警告が出る |
| `/context`（新しいセッションで） | 起動直後に何がどれだけ載っているか |
| `npx ccusage@latest daily --breakdown` | 導入前後1〜2週間の「作業日あたりコスト」をモデル別に比較（コミュニティ製ツール） |
| ステータスライン | `/statusline モデル名・コンテキスト使用率・キャッシュの状態を表示して` と頼むと自動で作ってくれる |

---

## カスタマイズ・無効化

| やりたいこと | 方法 |
|---|---|
| compact の閾値を変える | `/autocompact 400k`（`/autocompact auto` で既定に戻す） |
| 出力要約を一時的に切る | コマンドの先頭に `LEAN_QUIET=0` を付ける、または環境変数 `LEAN_QUIET=0` |
| サブエージェントをメインと同じモデルに戻す | `settings.json` の `env.CLAUDE_CODE_SUBAGENT_MODEL` を削除 |
| 質問を減らして自走させたい | `/output-style proactive`（Concise の代わり。両方同時には使えない） |
| すべて元に戻す | `node install.cjs --uninstall`（バックアップは `settings.json.bak-*`） |

---

## あえて入れなかったもの（とその理由）

| 入れなかったもの | 理由 |
|---|---|
| 汎用ルールを並べた大きな CLAUDE.md | Anthropic は Claude 5 世代向けに Claude Code のシステムプロンプトを80%以上削っても評価が落ちなかったと公表。ルール同士の衝突は余計な思考を生む |
| model / effort の固定 | 公式は「まず既定値」を推奨。Opus 5.5 / Sonnet 5.5 の既定 medium は、Opus 5.5 なら Opus 5 の high と同等以上 |
| 「学びを CLAUDE.md に書く」自前スキル | 現在は auto memory が自動で記憶する |
| 自前の設定棚卸しスキル | 公式の `/doctor`（CLAUDE.md とスキルの適正化）と `/skill-doctor`（使っていないスキルの検出）で足りる |
| 既定での plan mode / `opusplan` | `opusplan` は plan の出入りのたびにモデルが切り替わり、キャッシュを作り直す |
| スキルの `model:` 指定 | そのターンがモデル切替扱いになり、キャッシュを作り直す |
| `MAX_THINKING_TOKENS=0` | Opus 5.5 / Sonnet 5.5 では思考をオフにできず効果がない |

---

## 出典

公式（モデル）
- Introducing Claude Sonnet 5.5（2026-09-28）: https://www.anthropic.com/claude-sonnet-5-5
- Coding sessions are longer and use more context. Claude Opus 5.5 is built with that in mind.（2026-09-24）: https://claude.com/blog/claude-opus-5-5-built-for-coding-sessions-that-use-more-context

公式ドキュメント
- Best practices: https://code.claude.com/docs/en/best-practices
- Manage costs effectively: https://code.claude.com/docs/en/costs
- How Claude Code uses prompt caching: https://code.claude.com/docs/en/prompt-caching
- Model configuration（auto-compact・effort・モデル）: https://code.claude.com/docs/en/model-config
- Hooks guide: https://code.claude.com/docs/en/hooks-guide
- Skills: https://code.claude.com/docs/en/skills
- Output styles: https://code.claude.com/docs/en/output-styles
- Advisor tool: https://code.claude.com/docs/en/advisor

公式ブログ
- Maximizing the value of your Claude Code sessions（2026-08）: https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions
- Choosing a Claude model and effort level in Claude Code（2026-07）: https://claude.com/blog/claude-model-and-effort-level-in-claude-code
- The new rules of context engineering for Claude 5 generation models（2026-07）: https://claude.dev/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models/
- The advisor strategy: https://claude.com/blog/the-advisor-strategy

その他
- ccusage（コミュニティ製）: https://www.npmjs.com/package/ccusage
- 最新価格は https://claude.com/pricing で確認してください

## License

MIT
