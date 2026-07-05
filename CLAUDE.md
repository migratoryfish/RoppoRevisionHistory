# CLAUDE.md

日本の法令の条文改正履歴を GitHub 風 diff ＋時系列 UI で閲覧する静的 Web アプリ。
ユーザーは**司法書士**。法令選定・用語は登記実務基準（新旧対照表・施行日・通達準則などの法制執務用語を正確に使うこと）。

- 公開: https://migratoryfish.github.io/RoppoRevisionHistory/ （GitHub Pages / gh-pages ブランチ）
- リポジトリ: github.com/migratoryfish/RoppoRevisionHistory（public）

## コマンド

```bash
npm run fetch-data   # e-Gov APIから増分取得（data/raw/<lawId>/ にキャッシュ、既存はスキップ）
npm run build-data   # public/data/ に全データセット生成（laws/*.json, index.json, attachments/）
npm run dev          # 開発サーバー
npm run typecheck    # tsc --noEmit（buildは型チェックしないので別途実行する）
npm run build        # dist/ に静的サイト出力
npx vite preview --port 4173   # dist確認（SPAフォールバックで存在しないパスも200になる点に注意）

# 手動収録文書のPDF変換（courts=最高裁規則系 / junsoku=法務省準則系）
node pipeline/manual-convert.mjs <courts|junsoku> <input.pdf|txt> <output.txt>
```

デプロイ: main に push すれば GitHub Actions（`.github/workflows/update.yml`）が自動でビルド＆デプロイ。
手動の場合は `npm run build` 後、dist/ 内で
`git init -b gh-pages && git add -A && git commit -m deploy && git push -f https://github.com/migratoryfish/RoppoRevisionHistory.git gh-pages && rm -rf .git`

## アーキテクチャ

```
pipeline/laws.mjs          対象法令リスト（id/category/latestOnly/name）。追加はここに1行
pipeline/fetch.mjs         e-Gov API v2から取得（law_revisions→law_data→attachment）
pipeline/build.mjs         生データ＋手動収録 → public/data/ のデータセット生成
pipeline/manual-convert.mjs 公式PDF抽出テキスト→手動収録形式の変換器
data/raw/<lawId>/          生キャッシュ（gitignore、約500MB。CIではactions/cacheに保持）
data/manual/<slug>/        e-Gov非収録文書（meta.json + <適用日>.txt。書式はdata/manual/README.md）
public/data/               生成物（コミットする）: index.json / laws/<lawId>.json / attachments/
src/App.tsx                ルーティング（#/l/<lawId>/a/<条キー>/<版idx>）と法令ロード
src/data.ts  src/diff.ts   ローダー・diff計算（jsdiff: 行=diffArrays、行内=diffChars）・blame
src/components/            LawList / HeatmapView / ArticleView / Timeline / DiffView / Sidebar / LineContent
```

## データモデル（核心）

- **時間軸は施行日**。同一施行日に複数の改正法が施行される場合は1スナップショットに集約
- **スナップショット方式**: 条ごとに「内容が変わったスナップショットのみ」全文（行リスト）を保持。
  diff・blame・新旧対照はすべてクライアント側で計算する
- **行（Line）= 項・号・表の行・図**。`{i: インデント深さ, t: テキスト, f?: 添付パス}`。
  表（TableStruct）はセルを「｜」区切りで1行に直列化（差分検出のため）。全文表示時に実HTMLテーブル化
- 条キー: e-Gov XMLの `Num` 属性（`404`, `404_2`=枝番, `38:84`=範囲削除）。
  別表・様式は疑似条 `appdx:<タグ名>:<Num>`（part=「別表・様式」）
- 条の消滅は `gone:true` の変更イベント。同日新設条を「移動先候補」として提示（自動対応付けは未実装）
- `latestOnly: true` の法令は現行版のみ（現在は登録免許税法のみ。161版×2MBの履歴が重いため）

## 収録範囲（2026-07時点: 47文書）

- e-Gov 43法令（六法＋主要法令＋司法書士業務系）。**対象外**: 租税特別措置法・所得税法・法人税法・
  消費税法・地方自治法（データサイズ・版数超過。追加検討時は必ず先にAPIで版数×1版サイズを実測する）
- 手動収録4文書（現行版のみ）: 民事保全規則・民事訴訟規則・民事執行規則・不動産登記事務取扱手続準則。
  改正されたら新PDFを manual-convert で変換し `<新適用日>.txt` を置くだけで差分表示が始まる

## ハマりどころ・注意

- **e-Gov API v2**: 本文は `/law_data/{law_revision_id}`（law_fileではない）。履歴一覧はAPIが新しい順で
  返し、同一施行日の複数エントリは最初のものが最終状態。添付は `/attachment/{law_revision_id}?src=...`
- **moj.go.jp はcurlに403** を返す。ブラウザ相当の User-Agent ヘッダを付けること
- **法務省準則PDFはテキスト層の句読点位置が乱れる**（「。）」の句点が行末へ飛ぶ等）。
  manual-convert の junsoku プリセットに修復ヒューリスティック実装済みだが完全ではない。
  手動収録文書は必ず「出典・要校閲」を sourceNote に書き、UIに表示する
- 民訴規則の収録版は2024-03-01版で、**令和6年最高裁規則14号（デジタル化）以降は未反映**（新PDF待ち）
- 変換後は**条の欠番チェック**を行うこと（連結削除条「第X条及び第Y条 削除」は展開処理済み）
- git: コミットは noreply アドレス設定済み。データ更新コミット（public/data）はActionsも行うため
  workflowの paths-ignore と衝突しないよう注意
- 検証の定番: 民法404条 `#/l/129AC0000000089/a/404`（2020年債権法改正の法定利率）、
  不動産登記規則の「別表・様式」（様式PDF表示）、憲法（1版のみでもUIが壊れないこと）

## 拡張の既定路線（合意済み）

全法令対応が必要になったら「案2: ブラウザから e-Gov API を直接叩くオンデマンド型」を追加する
（CORS は `Access-Control-Allow-Origin: *` を確認済み）。主要法令=事前計算、ロングテール=オンデマンドの
ハイブリッドが最終形。サーバーが必要になるのは全文横断検索をやるときだけ。
