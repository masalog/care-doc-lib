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

### 目指すアーキテクチャ

```text
DB
 ↓
Entity
 ↓
Value Object
 ↓
DTO
 ↓
Mapper
 ↓
Repository
 ↓
Service
 ↓
Controller
 ↓
View
```

責務分離を徹底し、長期保守・機能追加・永続化方式変更に強い構成を目指す。

---

### 第1フェーズ：データ・ドメイン設計（最優先）

#### 1. DB構造整理

現在の IndexedDB スキーマを棚卸しし、項目・責務・関連性を明確化する。

対象:

```text
members
settings
```

成果物:

- ER図
- テーブル定義書
- 項目一覧
- データ辞書

---

#### 2. Entity定義

業務上の核となるエンティティを定義する。

対象:

```text
MemberEntity
SettingsEntity
ApplicationEntity
```

期待効果:

- 業務ルールの集約
- データ構造の明確化
- ドメイン知識のコード化

---

#### 3. Value Object定義

業務上意味を持つ値を独立したオブジェクトとして定義する。

対象候補:

```text
PhoneNumber

PostalCode

InsuranceIdNumber

CareLevel

ApplicationDate
```

期待効果:

```text
不正値混入防止

バリデーション集約

ドメイン知識の可視化

Entityの責務整理
```

---

#### 4. DTO定義

レイヤー間のデータ受け渡しを標準化する。

対象:

```text
MemberDTO

SettingsDTO

ApplicationDTO

PdfDataDTO
```

期待効果:

- レイヤー間の疎結合化
- ViewとDomainの分離
- PDF生成処理の単純化

---

#### 5. Mapper定義

Entity・DTO・永続化データの変換処理を集約する。

対象:

```text
MemberMapper

SettingsMapper

ApplicationMapper

PdfDataMapper
```

責務:

```text
Entity ←→ DTO

DTO ←→ Repository

DTO ←→ PDFデータ
```

期待効果:

```text
変換処理の一元管理

Service肥大化防止

テスト容易化
```

---

### 第2フェーズ：アーキテクチャ再設計

#### 6. Repository層導入

永続化処理を集約する。

対象:

```text
IMemberRepository
ISettingsRepository

IndexedDbMemberRepository
IndexedDbSettingsRepository
```

期待効果:

- IndexedDB依存の隔離
- SQLite移行容易化
- テスト容易化

---

#### 7. Service層導入

業務ロジックを集約する。

対象:

```text
MemberService
SettingsService
PdfService
```

責務例:

```text
PDF生成データ構築

ファイル名生成

業務ルール適用

DTO変換
```

---

#### 8. Controller層導入

UIイベント処理を分離する。

対象:

```text
AdminController

PdfController
```

責務:

```text
ユーザー操作受付

Service呼び出し

View更新
```

---

#### 9. 契約クラス（Interface相当）導入

JavaScriptでは抽象クラス風の実装で対応する。

対象:

```text
IMemberRepository
ISettingsRepository

IMemberService
ISettingsService
IPdfService

IAdminController
IPdfController
```

期待効果:

```text
実装交換容易化

責務明確化

保守性向上
```

---

### 第3フェーズ：品質向上

#### 10. バリデーション統一

入力検証を一元管理する。

対象:

```text
利用者情報

共通設定

申請情報
```

例:

```text
必須チェック

日付妥当性

電話番号形式

郵便番号形式
```

---

#### 11. 例外設計

例外分類とハンドリング方針を整備する。

例:

```text
ValidationException

BusinessException

InfrastructureException
```

対象:

```text
入力エラー

PDF生成失敗

DB操作失敗

アセット読込失敗
```

---

#### 12. ログ設計

障害解析と運用保守の効率化を図る。

対象:

```text
利用者登録

利用者更新

利用者削除

PDF生成

設定変更

DB移行
```

---

#### 13. 単体テスト導入

各コンポーネントを個別に検証する。

対象:

```text
Entity

Value Object

DTO

Mapper

Service

Repository

PDF関連ユーティリティ
```

テスト例:

```text
MemberEntity生成

PhoneNumber妥当性

CareLevel変換

PdfDataDTO生成

Mapper変換

ファイル名生成
```

---

#### 14. 結合テスト導入

レイヤー間の連携を検証する。

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

シナリオ例:

```text
利用者登録 → 保存 → 読込

共通設定保存 → 読込

利用者選択 → PDF生成

PDF生成データ構築
```

---

#### 15. E2Eテスト導入

利用者視点で業務フロー全体を検証する。

候補:

```text
Playwright
```

シナリオ例:

```text
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
プレビュー確認
 ↓
ダウンロード確認
```

---

### 第4フェーズ：永続化強化

#### 16. SQLite対応

永続化基盤の強化を検討する。

候補:

```text
SQLite
```

期待効果:

```text
データ管理安定化

バックアップ容易化

Tauriとの高い親和性
```

---

#### 17. Migration戦略策定

スキーマ変更管理方式を整備する。

例:

```text
Schema Version 1
 ↓
Schema Version 2
 ↓
Schema Version 3
```

対象:

```text
IndexedDBスキーマ更新

SQLite移行

項目追加対応
```

---

#### 18. Flyway相当の運用導入

SQLite採用後のスキーマ管理を標準化する。

候補:

```text
Flyway

独自Migration機構
```

目的:

```text
スキーマ変更履歴管理

自動アップグレード

バージョン管理
```

---

### 第5フェーズ：運用・セキュリティ

#### 19. バックアップ戦略

利用者データ保全を強化する。

候補:

```text
JSONエクスポート

SQLiteバックアップ

ZIP出力
```

---

#### 20. セキュリティ強化

個人情報保護対策を整備する。

対象:

```text
氏名

住所

電話番号

生年月日

被保険者番号
```

検討事項:

```text
SQLite暗号化

バックアップ暗号化

ローカルデータ保護
```

---

#### 21. ADR（Architecture Decision Record）導入

重要な設計判断を文書化する。

管理例:

```text
ADR-001
なぜ IndexedDB を採用したか

ADR-002
なぜ Repository パターンを採用したか

ADR-003
なぜ SQLite へ移行するのか

ADR-004
なぜ pdf-lib を継続利用するのか

ADR-005
なぜ Tauri を採用したのか
```

期待効果:

```text
設計意図の共有

将来の保守性向上

技術選定理由の可視化

属人化防止
```

ディレクトリ例:

```text
docs/
└── adr/
    ├── ADR-001-indexeddb.md
    ├── ADR-002-repository.md
    ├── ADR-003-sqlite.md
    ├── ADR-004-pdf-lib.md
    └── ADR-005-tauri.md
```

---

#### 22. フォルダ構成再編

責務ごとにコードを整理する。

```text
assets/
├── controllers/
├── services/
├── repositories/
├── interfaces/
├── entities/
├── value-objects/
├── dtos/
├── mappers/
├── views/
├── pdf/
└── shared/
```

---

#### 23. PDFエンジン疎結合化

DOM依存を排除し、Service経由でPDF生成を行う。

現状:

```text
DOM
 ↓
pdf-lib
```

目標:

```text
Controller
 ↓
Service
 ↓
PdfService
 ↓
pdf-lib
```

期待効果:

```text
テスト容易性向上

保守性向上

ライブラリ差し替え容易化

責務分離の徹底
```
---

## 免責事項

 本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。正式な手続きには中央区提供の最新書式をご使用ください。本ツールの利用により生じた損害等について作成者は責任を負いません。
