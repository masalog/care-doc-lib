# CareDocLib — 介護認定申請書作成アプリ（pdf-lib 版）

CareDocWeb（Java / Spring Boot + Apache PDFBox + AWS Lambda）の PDF 生成部分を、ブラウザだけで完結する pdf-lib(JavaScript) 構成に移植し、データ保存・静的ホスティング対応までを行いました。PDF生成もデータ保存もすべてブラウザ内で完結し（サーバー処理なし・データ外部送信なしのゼロデータ）、介護認定申請書テンプレPDFの座標上に入力データをレンダリングします。

---

## 最新状況

CareDocLib は当初 Cloudflare Pages 上で動作する静的 Web アプリとして構築しましたが、現在は Bun + Rust + Tauri に対応し、Windows デスクトップアプリとして運用しています。

対応形態:

- ローカル実行版
- Tauri デスクトップ版（Windows）

現在も PDF生成は pdf-lib、データ保存は IndexedDB を利用しています。今後 SQLite への移行を検討しています。

---

## Tauri デスクトップ版

### 開発起動

bun install
bunx tauri dev

### 配布用ビルド

bun install
bunx tauri build

### 出力先

src-tauri/target/release/bundle/

### 特徴

- サーバー不要
- オフライン利用可能
- 既存のHTML/CSS/JavaScript資産を流用
- PDF生成機能をそのまま利用可能

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

保存先は DB 名 `caredoc`、ストア `members`（利用者）/ `settings`（共通設定）。 初回起動時、利用者データが空なら CareDocWeb のエクスポートデータ（利用者7名＋共通設定1件）を自動投入します（`storage-seed.js` の `seedIfEmpty()`）。 ブラウザのデータを消去すると保存内容も消えます。端末間の同期はありません。

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

## 今後の課題

### Controller / Service / Repository 構成への再設計

画面操作、業務ロジック、データアクセスを分離し、責務を明確化する。

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
IndexedDB
```

期待効果:

- 保守性向上
- 可読性向上
- テスト容易性向上
- SQLite移行の容易化

---

### 契約クラス（Interface相当）の導入

JavaScriptでは抽象クラス風の契約クラスを利用し、
各レイヤーの責務と公開APIを明確化する。

例:

```text
IMemberRepository
ISettingsRepository
IPdfService

IMemberService
ISettingsService

IAdminController
IPdfController
```

期待効果:

- 実装ルールの統一
- 保守担当者間の認識差異防止
- 将来的な実装差し替え対応

---

### PDF生成処理のDOM依存排除

現在は hidden フィールドを介してPDFエンジンへデータを受け渡している。

将来的には

```text
Member
Settings
Application
```

から

```text
PdfData
```

を構築し、

```javascript
pdfService.generate(pdfData);
```

の形へ移行する。

期待効果:

- hidden項目削減
- PDF処理と画面処理の疎結合化
- テスト容易性向上

---

### ドメインモデルの導入

明確なモデルクラスを定義する。

```text
Member
Settings
Application
PdfData
```

期待効果:

- データ構造の一元管理
- バグ混入防止
- コードの自己説明性向上

---

### 永続化層の抽象化

IndexedDBへの直接依存をRepositoryへ隔離する。

```text
IndexedDbMemberRepository
IndexedDbSettingsRepository
```

将来的には

```text
SqliteMemberRepository
SqliteSettingsRepository
```

へ差し替え可能な構成を目指す。

### SQLite対応の検討

現在の IndexedDB に加え、
Tauri環境での SQLite 利用を評価する。

検討事項:

- 移行手順
- データ互換性
- バックアップ方式
- パフォーマンス比較

期待効果:

- データ管理の安定化
- バックアップ容易化
- 将来的な拡張対応

---

### 例外処理とエラーハンドリングの統一

Repository / Service / Controller ごとに
エラー処理ポリシーを定義する。

例:

```text
ユーザー向けメッセージ

開発者向けログ

システムエラー
```

を分離する。

---

### ログ出力基盤の整備

以下のイベントを記録対象とする。

- PDF生成失敗
- データ保存失敗
- データ読込失敗
- アセット読込失敗

期待効果:

- 障害解析容易化
- 保守性向上

---

### 単体テスト

対象:

- Repository
- Service
- PDF関連ユーティリティ

目的:

- ロジック単位の品質確保

---

### 結合テスト

対象:

```text
Controller
 ↓
Service
 ↓
Repository
 ↓
IndexedDB
```

確認内容:

- 利用者登録 → 保存 → 読込
- 共通設定保存 → 読込
- PDF生成データ構築
- Repository差し替え時の回帰確認

目的:

- レイヤー間連携の品質確保

---

### E2Eテスト

将来的に Playwright 導入を検討する。

シナリオ例:

```text
管理画面起動
 ↓
利用者登録
 ↓
共通設定保存
 ↓
PDF作成画面へ移動
 ↓
利用者選択
 ↓
申請日入力
 ↓
PDF生成
 ↓
プレビュー表示確認
 ↓
PDFダウンロード確認
```

目的:

- 実運用フロー全体の保証
- 回帰不具合の早期発見

---

### フォルダ構成の再整理

```text
assets/
├── controllers/
├── services/
├── repositories/
├── interfaces/
├── models/
├── views/
├── pdf/
└── shared/
```

責務ごとの分離を徹底する。

---

### PDFエンジンの更なる疎結合化

pdf-lib への依存を PDF Service 層へ集約する。

```text
Controller
 ↓
Service
 ↓
PdfService
 ↓
pdf-lib
```

構成を目指す。

期待効果:

- 実装の交換容易性
- テスト容易性向上
- ライブラリ依存の局所化

---

## 免責事項

⚠️ 本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。正式な手続きには中央区提供の最新書式をご使用ください。本ツールの利用により生じた損害等について作成者は責任を負いません。
