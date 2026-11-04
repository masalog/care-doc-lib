# CareDocLib — 介護認定申請書作成アプリ（pdf-lib 版）

CareDocWeb（Java / Spring Boot + Apache PDFBox + AWS Lambda）の PDF 生成部分を、ブラウザだけで完結する pdf-lib(JavaScript) 構成に移植し、データ保存・静的ホスティング対応までを行いました。PDF生成もデータ保存もすべてブラウザ内で完結し（サーバー処理なし・データ外部送信なしのゼロデータ）、介護認定申請書テンプレPDFの座標上に入力データをレンダリングします。

---

## 最新状況

CareDocLib は当初 Cloudflare Pages 上で動作する静的 Web アプリとして構築しましたが、現在は Bun + Rust + Tauri に対応し、Windows デスクトップアプリとして運用しています。

対応形態:

- ローカル実行版
- Tauri デスクトップ版（Windows）

現在のデータ保存は IndexedDB です。追加開発後の保存先には SQLite を採用する方針を決定しています。既存データの移行は未実施です。

---

## ロードマップ

### 目指すアーキテクチャ

```text
[フロントエンド：JS（WebView）]
View（HTML）
 ↓
画面ロジック（admin.js / main.js）
 ↓
PDF生成（pdf-lib）※フロントエンドに残す
 ↓ invoke（アプリ独自のコマンドのみ許可）
[バックエンド：Rust]
Command（Controller相当）
 ↓
Service（業務ルール・入力チェック）
 ↓
Repository
 ↓
SQLite
```

- 画面からはSQLを直接実行させない（tauri-plugin-sql 等は使わない）
- JSとRustの受け渡しの型をDTO相当として先に定義する
- 実装は機能ごとにフロントエンドからバックエンドまで一続きで作り、都度統合する

---

第0フェーズ：要件定義・設計（済）

01. [ユースケース整理](docs/use-cases.md)
02. [機能要件定義書](docs/functional-requirements.md)
03. [品質要件定義書](docs/quality-requirements.md)
04. [ADR-001：Tauri採用](docs/adr/ADR-001-platform-tauri.md)
05. [ADR-002：SQLite採用](docs/adr/ADR-002-sqlite-storage.md)
06. [基本設計書](docs/basic-design.md)
07. [画面設計書](docs/screen-design.md)

第1フェーズ：安全網（最優先）

08. バックアップ（JSON書き出し・読み込み。現行IndexedDBのまま）
09. PDF出力の基準テスト（47項目の座標・印字内容の回帰確認）

※ CSP・capabilities の絞り込みは対応済み（`tauri.conf.json` / `capabilities/default.json`）

第2フェーズ：方針決定・データ設計

10. ADR-003：SQLiteはRustのコマンド経由で利用／DBファイルの暗号化方式の決定
11. ドメインモデル・DB構造（ER図を兼ねる。利用者・共通設定・テンプレート版）
12. コマンド一覧と受け渡しの型の定義（DTO相当）

第3フェーズ：機能ごとの実装・統合（Rust＋JSを一続きで）

13. 共通設定の読込・保存
14. 利用者の一覧・読込
15. 利用者の保存・削除（入力チェック・エラー形式の統一、Rust単体テスト）
16. IndexedDBからの移行（08のJSONをRust側で取り込み）
17. IndexedDB関連コードの削除・capabilitiesを独自コマンドのみに限定

第4フェーズ：PDF・運用

18. PDF生成の分離と座標・テンプレートの版管理（09で出力不変を確認）
19. ログ方針（個人情報を出力しない）・エラー時の通知
20. 配布・コード署名・更新方法（インストーラー、アップデート手順）

---

## 構成

```
care-doc-lib/
├── public/                        # フロントエンド資産（Tauriから読み込み）
│   ├── index.html                 # PDF作成画面（利用者選択 → PDF生成・プレビュー）
│   ├── admin.html                 # 利用者・共通設定の管理画面
│   ├── assets/                    # アプリのコード・ライブラリ
│   │   ├── style.css              # 画面共通スタイル
│   │   ├── admin.js               # 管理画面の利用者CRUD・共通設定
│   │   ├── pdf-core.js            # 共有変数・共通ヘルパー（$, setStatus 等）・アセット読込(bootstrap)
│   │   ├── pdf-draw.js            # 描画(drawText/drawCircle/mapCareLevel)・PDF生成(generate)
│   │   ├── pdf-export.js          # PDFファイル名生成・ダウンロード・PDF系ボタン登録
│   │   ├── storage-core.js        # フィールド定義・IndexedDB基盤(openDB/tx/collectFields/applyFields)
│   │   ├── storage-crud.js        # 利用者CRUD（保存/読込/削除）・共通設定の保存/復元
│   │   ├── storage-seed.js        # 初期データ(SEED)・PDF画面のDB初期化
│   │   ├── main.js                # PDF画面の起動
│   │   ├── pdf-lib.min.js         # PDF描画ライブラリ
│   │   └── fontkit.umd.min.js     # 日本語フォント埋め込み用
│   └── data/                      # テンプレ・フォント・座標
│       ├── template.pdf           # 介護認定申請書テンプレPDF（A4縦 595.32×842.04）
│       ├── NotoSansJP-Regular.ttf # 埋め込み用日本語フォント（約5.4MB）
│       └── positions.json         # 座標データ（47フィールド・元YAMLと同一値）
│
├── src-tauri/              # Tauriデスクトップアプリ
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── icons/
│   └── src/
│
├── package.json            # Bun管理
├── bun.lock
├── README.md
└── .gitignore

```
---

## Tauri デスクトップ版

### 開発起動

bun install<br>
bunx tauri dev

### 配布用ビルド

bun install<br>
bunx tauri build

### 出力先

src-tauri/target/release/bundle/

### 特徴

- サーバー不要
- オフライン利用可能
- 既存のHTML/CSS/JavaScript資産を流用
- PDF生成機能をそのまま利用可能

---

## 起動後の確認

- 上部に `座標:OK(47) / テンプレ:OK / フォント:OK`、下部に「準備完了」→ 読込成功
- 生成前はフォーム下部に案内文を表示
- 「PDF生成・プレビュー」→ フォーム下部にPDFを表示（表示されない場合は「新しいタブで開く」）
- エラー時は画面内の通知欄に内容を表示

---

## 主な機能

- 座標指定でのPDF生成: 47項目の座標データを使い、対応する項目に入力値や選択結果を描画
- 年は西暦で入力・印字（テンプレの年欄は元号印字のない自由記入欄）
- 性別・要介護度は「〇」で該当欄を囲む
- データ保存（IndexedDB）: 利用者（複数）＋共通設定（1件）を端末内に保存（後述）
- PDFファイル名: 保存時に `YYYY年M月D日_氏名様_介護認定申請書.pdf` を自動生成（例: `2026年8月7日_田中一郎様_介護認定申請書.pdf`）。氏名の空白は詰め、入力があれば末尾に「様」を付与（未入力時は「無名」で「様」なし）

---

## データ保存（IndexedDB・端末内のみ）

PDF作成画面（`index.html`）と管理画面（`admin.html`）の2画面構成です。利用者データと共通設定は同じブラウザの IndexedDB を共有し、外部サーバーへ送信しません。

- 管理画面では利用者の登録・編集・削除と共通設定の保存ができます。
- PDF作成画面では登録済み利用者を選び、申請日・変更理由を指定してPDFを生成します。
- 共通設定は1件を保存し、PDF作成画面で自動的に使用します。

保存先は DB 名 `caredoc`、ストア `members`（利用者）/ `settings`（共通設定）。 初回起動時、利用者データが空なら CareDocWeb のエクスポートデータ（利用者7名＋共通設定1件）を自動投入します（`storage-seed.js` の `seedIfEmpty()`）。ブラウザー版ではブラウザーのサイトデータを消去すると保存内容も消えます。Tauri版のIndexedDBはアプリのWebView領域に保存され、通常のブラウザーのデータ消去とは別ですが、アプリデータの削除・初期化等で失われる可能性があります。端末間の同期はありません。

---

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
|--------|--------|
| フロントエンド | HTML / CSS / JavaScript |
| PDF生成 | pdf-lib |
| データ保存 | IndexedDB |
| パッケージ管理 | Bun |
| デスクトップ化 | Tauri 2.x |
| ネイティブ基盤 | Rust |

---

## 免責事項

 本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。正式な手続きには中央区提供の最新書式をご使用ください。本ツールの利用により生じた損害等について作成者は責任を負いません。
