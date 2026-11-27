# CareDocLib — 介護認定申請書作成アプリ（pdf-lib版）

CareDocWeb（Java / Spring Boot + Apache PDFBox + AWS Lambda）のPDF生成部分を、ブラウザのみで完結する pdf-lib（JavaScript）構成へ移植したアプリです。

PDF生成、データ保存、バックアップをクライアント側のみで完結させることで、

- サーバー不要
- オフライン利用可能
- 個人情報の外部送信なし

を実現しています。

介護認定申請書テンプレートPDF上の座標へ入力データを描画し、完成した申請書PDFを生成します。

---

## 最新状況

CareDocLibは当初 Cloudflare Pages 上で動作する静的Webアプリとして構築しました。

現在は Tauri を採用し、Windows向けデスクトップアプリとして運用しています。

データ保存には IndexedDB を利用しています。

当初検討していた SQLite への移行は実施しません。

本アプリは

- 単一利用者環境
- オフライン利用
- 数百～数千件規模のデータ管理
- PDF生成中心

を前提としているため、シンプルさと保守性を優先し、IndexedDBを正式な永続化ストアとして採用します。

また、業務ロジックは JavaScript に集約し、Rust は Tauri ランタイムとしてのみ利用します。

---

![CareDocLib画面](https://github.com/user-attachments/assets/48009725-1ce7-4543-87d3-e20ccdcf45fa)

---

## ロードマップ

### 目指すアーキテクチャ

```text
[Frontend : JavaScript]

View（HTML）
 ↓
Controller
 ↓
Validation
 ↓
Service
 ↓
Repository
 ↓
IndexedDB

Backup
 ↓
JSON Export / Import

PDF生成
 ↓
pdf-lib


[Tauri]

Window
Dialog
File Access
Updater


[Rust]

Tauri Runtime
```

### 設計方針

- アプリケーション本体はJavaScriptで実装する
- PDF生成はpdf-libで統一する
- データ保存はIndexedDBを利用する
- JSONバックアップを正式な退避手段とする
- SQLを導入しない
- SQLiteを導入しない
- Web版とデスクトップ版で可能な限りコードを共有する
- RustはTauri実行基盤として利用する

---

## 第1フェーズ：要件定義・設計（済）

01. [ユースケース整理](docs/use-cases.md)
02. [機能要件定義書](docs/functional-requirements.md)
03. [品質要件定義書](docs/quality-requirements.md)
04. [ADR-001：Tauri採用](docs/adr/ADR-001-platform-tauri.md)
05. ADR-002：IndexedDB継続採用
06. [基本設計書](docs/basic-design.md)
07. [画面設計書](docs/screen-design.md)

---

## 第2フェーズ：安全網（済）

08. [バックアップ機能（JSON書き出し・復元）](docs/impl/08-backup.md)

### 補足

- CSP設定済み
- Tauri Capabilities設定済み

---

## 第3フェーズ：設計整理

09. ADR-003：JavaScript中心アーキテクチャ整理

10. IndexedDBストア設計見直し

11. JSDoc型定義整理

### 目的

- JavaScript責務の明確化
- 型定義の統一
- 永続化レイヤ整理

---

## 第4フェーズ：保守性向上

12. Repository層整理

13. Validation共通化

14. エラー処理統一

15. バックアップ機能改善

16. データ件数増加時の性能確認

### 確認対象

- 100件
- 1,000件
- 5,000件
- 10,000件

---

## 第5フェーズ：PDF・運用

17. PDF出力回帰テスト

18. テンプレート・座標データ管理整理

19. ログ方針整備

20. 配布・更新方式整備

対象：

- インストーラー
- コード署名
- 更新方式

---

## ディレクトリ構成

```text
care-doc-lib/

public/
├── index.html
├── admin.html
│
├── assets/
│   ├── css/
│   │   └── style.css
│   │
│   └── js/
│       ├── controllers/
│       ├── services/
│       ├── repositories/
│       │   └── indexeddb/
│       ├── validation/
│       ├── backup/
│       └── pdf/
│
└── data/
    ├── template/
    ├── fonts/
    └── positions/

src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── icons/
└── src/
    └── main.rs

package.json
bun.lock
README.md
.gitignore
```

---

## Tauriデスクトップ版

### 開発起動

```bash
bun install
bunx tauri dev
```

### 配布用ビルド

```bash
bun install
bunx tauri build
```

### 出力先

```text
src-tauri/target/release/bundle/
```

### 特徴

- サーバー不要
- オフライン利用可能
- Windowsデスクトップアプリ
- PDF生成機能をそのまま利用
- IndexedDB利用
- JSONバックアップ対応

---

## 起動後の確認

- 上部に `座標:OK(47) / テンプレ:OK / フォント:OK`
- 下部に「準備完了」が表示される
- 「PDF生成・プレビュー」でフォーム下部へPDF表示
- エラー時は通知欄に内容を表示

---

## 主な機能

### PDF生成

- 47項目の座標データを利用
- テンプレートPDFへの描画
- pdf-libによるPDF生成

### 利用者管理

- 登録
- 編集
- 削除
- 一覧表示

### 共通設定

- 事業所情報保存
- PDF生成時の自動反映

### データ保存

- IndexedDB利用
- 端末内保存
- 外部送信なし

### バックアップ

- JSONエクスポート
- JSONインポート
- 復元前自動バックアップ

---

## データ保存

CareDocLibは IndexedDB を正式な永続化ストアとして利用します。

### 保存内容

- 利用者情報
- 共通設定
- アプリ設定

### 特徴

- ブラウザ標準機能
- オフライン利用可能
- 数千件規模のデータに対応
- サーバー不要

### バックアップ戦略

以下を組み合わせてデータを保護します。

- IndexedDB保存
- JSONエクスポート
- JSONインポート
- 復元前自動バックアップ

---

## PDFBox → pdf-lib 対応表

| 現状（PDFBox / Java） | 本アプリ（pdf-lib / JS） |
|---|---|
| Loader.loadPDF() | PDFDocument.load() |
| PDType0Font.load() | registerFontkit() + embedFont() |
| showText() | page.drawText() |
| drawCircle() | "〇"描画 |
| YAML座標定義 | JSON座標定義 |

座標原点はどちらも左下基準のため、座標値はそのまま利用しています。

---

## 技術スタック

| 分類 | 技術 |
|--------|--------|
| フロントエンド | HTML / CSS / JavaScript |
| PDF生成 | pdf-lib |
| データ保存 | IndexedDB |
| バックアップ | JSON |
| パッケージ管理 | Bun |
| デスクトップ化 | Tauri 2.x |
| Rust利用範囲 | Tauri Runtime |
| サーバー | なし |

---

## アーキテクチャ方針

CareDocLib は「JavaScriptアプリケーションをTauriでデスクトップ化する」という考え方を採用します。

そのため、

- 業務ロジック
- データ管理
- PDF生成
- バックアップ

はすべてJavaScriptで実装します。

Rustはアプリケーション本体ではなく、Tauri実行基盤として使用します。

この方針により、

- 保守コスト削減
- 開発速度向上
- Web技術への集中
- コード量削減

を実現します。

---

## 免責事項

本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。

正式な手続きには自治体が提供する最新様式をご利用ください。

本ツールの利用によって生じた損害について、作成者は責任を負いません。