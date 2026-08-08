# CareDocLib — 介護認定申請書作成アプリ（pdf-lib 版）

CareDocWeb（Java / Spring Boot + Apache PDFBox + AWS Lambda）の PDF 生成部分を、ブラウザだけで完結する pdf-lib(JavaScript) 構成に移植し、データ保存・静的ホスティング対応までを行いました。PDF生成もデータ保存もすべてブラウザ内で完結し（サーバー処理なし・データ外部送信なしのゼロデータ）、介護認定申請書テンプレPDFの座標上に入力データをレンダリングします。

## 公開デモ

🔗 [https://f98be7a1.care-doc-lib.pages.dev](https://f98be7a1.care-doc-lib.pages.dev)（Cloudflare Pages）


---

## 構成

```
care-doc-lib/
├── public/                        # ★デプロイ対象（これだけを配信する）
│   ├── index.html                 # 本体マークアップ（フォーム入力 → PDF生成・プレビュー・保存）
│   ├── _headers                   # Cloudflare Pages用キャッシュ・セキュリティ設定
│   ├── assets/                    # アプリのコード・ライブラリ
│   │   ├── styles.css             # スタイル（ベージュ＋オレンジ配色）
│   │   ├── pdf-core.js            # 共有変数・共通ヘルパー（$, setStatus 等）・アセット読込(bootstrap)
│   │   ├── pdf-draw.js            # 描画(drawText/drawCircle/mapCareLevel)・PDF生成(generate)
│   │   ├── pdf-export.js          # PDFファイル名生成・ダウンロード・PDF系ボタン登録
│   │   ├── storage-core.js        # フィールド定義・IndexedDB基盤(openDB/tx/collectFields/applyFields)
│   │   ├── storage-crud.js        # 利用者CRUD（保存/読込/削除）・共通設定の保存/復元
│   │   ├── storage-export.js      # まとめて保存（全データをJSONファイルへ書き出し）
│   │   ├── storage-import.js      # まとめて追加（JSONファイルから利用者を追加・検証）・ボタン登録(initIO)
│   │   ├── storage-seed.js        # 初期データ(SEED)・起動(initStorage)・イベント登録
│   │   ├── main.js                # 起動呼び出し（bootstrap() / initStorage()）
│   │   ├── pdf-lib.min.js         # PDF描画ライブラリ
│   │   └── fontkit.umd.min.js     # 日本語フォント埋め込み用
│   └── data/                      # テンプレ・フォント・座標
│       ├── template.pdf           # 介護認定申請書テンプレPDF（A4縦 595.32×842.04）
│       ├── NotoSansJP-Regular.ttf # 埋め込み用日本語フォント（約5.4MB）
│       └── positions.json         # 座標データ（47フィールド・元YAMLと同一値）
│
├── .gitignore
└── README.md

```

---

## ローカルでの起動・確認

ブラウザ で `http://localhost:5500` を開く（`Ctrl + F5` で強制再読み込み推奨）

---

## 起動後の確認

- 上部に `座標:OK(47) / テンプレ:OK / フォント:OK`、下部に「準備完了」→ 読込成功
- 生成前は右側にプレースホルダー（書類アイコン＋案内文）を表示
- 「PDFを生成してプレビュー」→ 右にPDF表示（出ない場合は「新しいタブでPDFを開く」）
- エラー時は画面上部に赤帯で内容表示

---

## 主な機能

- 座標指定でのPDF生成: テンプレPDFの47フィールドに、フォーム入力値を座標指定で描画
- 年は西暦で入力・印字（テンプレの年欄は元号印字のない自由記入欄）
- 性別・要介護度は「〇」で該当欄を囲む
- データ保存（IndexedDB）: 利用者（複数）＋共通設定（1件）を端末内に保存（後述）
- PDFファイル名: 保存時に `YYYY年M月D日_氏名様_介護認定申請書.pdf` を自動生成（例: `2026年8月7日_田中一郎様_介護認定申請書.pdf`）。氏名の空白は詰め、入力があれば末尾に「様」を付与（未入力時は「無名」で「様」なし）

---

## 配色（ベージュ＋オレンジ）

`assets/styles.css` の CSS 変数で管理:

| 用途 | 色 |
| --- | --- |
| 背景 | ベージュ `#f5efe6` |
| カード | 明るいベージュ `#fbf7f0` |
| アクセント（ボタン・見出し・フォーカス枠） | オレンジ `#e8843d` |
| 淡いアクセント（免責バー・ホバー） | 淡オレンジ `#fce4cf` |
| 文字 | ダークブラウン `#3f3a34` |

---

## データ保存（IndexedDB・端末内のみ）

入力データはブラウザの IndexedDB に保存され、外部サーバーへは一切送信されません（ゼロデータ維持）。 元の CareDocWeb の構造に合わせ、2種類に分けて保存します:

- 利用者データ（複数保存）: 氏名・被保険者番号・生年月日・住所・要介護度・有効期間・入所日など、人ごとに変わる項目。
  - 「保存済み利用者」のプルダウンで選択 → フォームに自動入力
  - 「この利用者を保存/更新」で登録・上書き、「削除」で削除
- 共通設定（1件のみ）: 調査場所・施設・代行者・主治医など事業所で共通の項目。
  - 「共通設定を保存」で保存、次回起動時に自動復元

保存先は DB 名 `caredoc`、ストア `members`（利用者）/ `settings`（共通設定）。 初回起動時、利用者データが空なら CareDocWeb のエクスポートデータ（利用者7名＋共通設定1件）を自動投入します（`storage-seed.js` の `seedIfEmpty()`）。 ブラウザのデータを消去すると保存内容も消えます。端末間の同期はありません。

---

## JSONファイルでの一括保存・追加

「保存済み利用者」パネルの2つのボタンで、全データをJSONファイルに書き出し・取り込みできます（すべて端末内で完結・外部送信なし）。

- まとめて保存（`storage-export.js`）: 全利用者＋共通設定を1つのJSONに書き出してダウンロード。ファイル名は `caredoc_backup_YYYY年M月D日.json`。
- まとめて追加（`storage-import.js`）: 保存したJSONを検証して取り込み。利用者はIDを振り直して既存に追加（既存は上書きされず常に増える）、共通設定は取り込んだ内容で上書き。実行前に件数を確認するダイアログを表示。

---

## デプロイ前チェックリスト

- [x] 公開用に `public/` へ整理（assets / data のサブフォルダ構成）
- [x] `_headers` でキャッシュ・セキュリティヘッダ設定
- [x] 免責事項を画面上に表示（公的文書のため）
- [x] データ保存（IndexedDB・利用者7名/共通設定を初期投入）
- [x] Cloudflare公開URL（`https://<project>.pages.dev/`）でアプリが正常に動作するか確認（アセット読込・PDF生成・保存/復元）

---

## Cloudflare Pages へのデプロイ

### Wrangler CLI

```bash
# Wrangler インストール
npm install -g wrangler

# Pages プロジェクト作成（初回のみ）
npx wrangler pages project create care-doc-lib

# デプロイ（毎回）
npx wrangler pages deploy public --project-name=care-doc-lib

# デプロイ状況確認
npx wrangler pages deployment list --project-name=care-doc-lib

```

## PDFBox → pdf-lib 対応表

| 現状（PDFBox / Java） | 本アプリ（pdf-lib / JS） |
| --- | --- |
| `Loader.loadPDF()` | `PDFDocument.load()` |
| `PDType0Font.load()` | `registerFontkit(fontkit)` + `embedFont(bytes, { subset:false })` |
| `cs.newLineAtOffset(x,y)` + `showText()` | `page.drawText(text, { x, y, size, font })` |
| `drawCircle()`（〇） | `page.drawText("〇", { x, y, size, font })` |
| `converted_positions.yaml` | `data/positions.json`（座標値は完全に同一・無変更） |
| `mapCareLevel()` switch | JSオブジェクトで同ロジック移植 |

座標原点はどちらも左下で一致するため、座標のズレは発生しない。

---

## トラブルシューティング（移行時に踏んだ落とし穴）

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| 右側が真っ白・ボタン無反応 | ライブラリ+フォントを全部Base64で1ファイル（約8MB）に埋め込み、ブラウザが固まった | ファイルを分割しローカルサーバーで配信 |
| 日本語が □ / 空白 | `embedFont` の `subset:true` でグリフ欠落 | `subset:false` に変更 |
| アセットが読めない | `file://` で開き `fetch` が制限される | ローカルサーバー / 本番URLで開く |
| PDFがプレビュー枠に出ない | Chrome が data: URI 埋め込みPDFをブロック | `blob:` URL + iframe に変更、別タブでも開けるように |
| フッター下端で文字が透ける | stickyフッターの負マージンで下端に隙間 | 負マージンを廃止し、パネル下パディングをフッターに委譲 |
| 保存時に `The database connection is closing` | members/settings を別々のトランザクションで await を挾んで開いていた | 1つの `db.transaction(["members","settings"])` でまとめて読み、`oncomplete` で解決 |

---

## 技術スタック

| 分類 | 技術 |
| --- | --- |
| フロントエンド | HTML / CSS / JavaScript（JSは機能ごとに9ファイルに分割） |
| PDF生成 | pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 |
| フォント | Noto Sans JP（埋め込み・`subset:false`） |
| データ保存 | IndexedDB（利用者 `members` / 共通設定 `settings`） |
| ホスティング | 静的（Cloudflare Pages） |

---

## セキュリティヘッダ

`public/_headers` の `/*` ブロックで、全レスポンスに以下のセキュリティヘッダを付与しています。外部リソースを一切読まない（CDNなし・全自己ホスト）構成のため、CSPを非常に厳しく設定できます。

| ヘッダ | 値 | 役割 |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | MIMEスニッフィングを禁止（拡張子に反した実行を防止） |
| `X-Frame-Options` | `DENY` | このページを一切iframeに埋め込ませない（クリックジャック対策を最大化）。PDFプレビューの `blob:` はローカル生成のためHTTPヘッダを持たず、子フレーム読込はCSP `frame-src blob:` で制御されるので影響なし |
| `Referrer-Policy` | `no-referrer` | 遷移先にリファラーを送らない（プライバシー保護） |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=()` | 位置情報・カメラ・マイクを全面無効化 |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | HTTPSを強制（1年間・サブドメイン含む） |
| `Cross-Origin-Opener-Policy` | `same-origin` | 他オリジンの文書との browsing context group と opener の共有を制限 |
| `Content-Security-Policy` | 自己オリジン（`'self'`）中心・`frame-ancestors 'none'` | XSS・不正リソース読込のリスクを軽減。`frame-ancestors 'none'` で被埋め込みを全面禁止（`X-Frame-Options: DENY` と一致）。PDFプレビュー用に `frame-src`/`img-src` は `blob:` を許可 |

---

## 免責事項

⚠️ 本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。正式な手続きには中央区提供の最新書式をご使用ください。本ツールの利用により生じた損害等について作成者は責任を負いません。
