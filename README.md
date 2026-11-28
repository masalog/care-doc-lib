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

CareDocLib はローカルファーストの考え方を採用しています。

利用者データの正本は各端末の IndexedDB に保存し、サーバーによる常時同期は行いません。

データ交換は JSON バックアップを利用し、必要に応じて他端末との共有や統合を行います。

本アプリは次の利用形態を前提としています。

- 単一利用者環境
- 小規模事業所内での利用
- オフライン利用
- 数百〜数千件規模の利用者管理
- PDF作成支援

そのため、

- シンプルな構成
- 保守性
- データの可搬性
- ローカル運用

を優先し、IndexedDBを正式な永続化ストアとして採用しています。

また、業務ロジックは JavaScript に集約し、Rust は Tauri Runtime としてのみ利用します。

![CareDocLib画面](https://github.com/user-attachments/assets/48009725-1ce7-4543-87d3-e20ccdcf45fa)

---

# ロードマップ

## 目指すアーキテクチャ

```text
[Frontend : JavaScript]

View
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

Merge
 ↓
Data Integration

PDF
 ↓
pdf-lib


[Tauri]

Window
Dialog
File Access


[Rust]

Tauri Runtime
```

### 設計方針

- アプリケーション本体は JavaScript で実装する
- PDF生成は pdf-lib を利用する
- データ保存は IndexedDB を利用する
- JSONバックアップを正式な退避およびデータ交換手段とする
- リアルタイム同期を前提としない
- 必要な場合のみデータ交換を行う
- 将来的なマージ機能に対応する
- Web版とデスクトップ版で可能な限りコードを共有する
- RustはTauri実行基盤として利用する

---

## 第1フェーズ：要件定義・設計（済）

01. [ユースケース整理](docs/use-cases.md)
02. [機能要件定義書](docs/functional-requirements.md)
03. [品質要件定義書](docs/quality-requirements.md)
04. [ADR-001：Tauri採用](docs/adr/ADR-001-platform-tauri.md)
05. [ADR-002：IndexedDB継続採用](docs/adr/ADR-002-indexeddb-storage.md)
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

09. [ADR-003：データ保護方針](docs/adr/ADR-003-data-protection.md)

10. [ADR-004：認証・認可および操作者識別の基本方針](docs/adr/ADR-004-authentication-authorization.md)

11. [実装設計書 09：認証・認可・画面ロック・操作者識別](docs/impl/09-auth.md)（済）

12. IndexedDBストア設計見直し

13. JSDoc型定義整理

### 目的

- JavaScript責務の明確化
- 型定義の統一
- 永続化レイヤ整理
- 認証・認可・操作者識別（1ロール・15分ロック）の導入方針整理

---

## 第4フェーズ：保守性向上

14. Repository層整理

15. Validation共通化

16. エラー処理統一

17. バックアップ機能改善

18. JSONマージ機能設計

19. データ件数増加時の性能確認

### 確認対象

- 100件
- 1,000件
- 5,000件
- 10,000件

---

## 第5フェーズ：PDF・運用

20. PDF出力回帰テスト

21. テンプレート・座標データ管理整理

22. ログ方針整備

23. 配布・更新方式整備

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
- IndexedDB利用
- JSONバックアップ対応
- JSONによるデータ交換対応
- 個人情報の外部送信なし

---

## 起動後の確認

- 初回起動時は「初回アカウント登録」、登録済み環境では「ログイン」画面が表示される
- ログイン後、上部に `座標:OK(47) / テンプレ:OK / フォント:OK`
- 下部に「準備完了」が表示される
- 「PDF生成・プレビュー」でフォーム下部へPDF表示
- エラー時は通知欄に内容を表示

---

## 主な機能

### 認証・認可・操作者識別

- 初回アカウント登録、4桁数字 PIN によるログイン・ログアウト（PBKDF2-SHA256 ハッシュ保管）
- 連続 5 回失敗時の 1 時間ロックアウト
- 15 分無操作による自動画面ロック（PIN 再入力で解除）
- 1 ロール（担当者共通権限）による画面・データ操作の認証ガード
- アカウント管理（追加・表示名変更・PIN 変更・削除。最後の 1 件削除時は現在の PIN 再入力を必須化）
- 利用者・共通設定レコードへの作成者／最終更新者の記録・表示

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

### データ共有

- JSONによるデータ交換
- PC移行
- 他端末への引き継ぎ
- 事業所内共有

---

## データ共有方針

CareDocLib はリアルタイム同期を前提としていません。

利用者データの正本は各端末の IndexedDB に保存します。

複数端末で利用する場合は、JSONバックアップを交換して運用します。

### 想定運用

```text
担当者A
 ↓
JSON出力

担当者B
 ↓
JSON出力

担当者C
 ↓
JSON出力

管理者
 ↓
取り込み
 ↓
統合版作成
```

### 主な用途

- バックアップ
- PC移行
- データ引き継ぎ
- 職員間共有
- 事業所内集約

---

## データ保存

CareDocLibは IndexedDB を正式な永続化ストアとして採用しています。

### 保存対象

- 利用者情報
- 共通設定
- アプリ設定

### 特徴

- ブラウザ標準機能
- オフライン利用可能
- 数千件規模のデータに対応
- サーバー不要

### バックアップ・共有戦略

CareDocLibではバックアップファイルを単なる復旧手段ではなく、データ交換フォーマットとして位置付けています。

JSONバックアップは以下の用途で利用します。

- 障害時の復旧
- PC移行
- データ共有
- 事業所内集約

### 保護手段

- IndexedDB保存
- JSONエクスポート
- JSONインポート
- 復元前自動バックアップ

### 将来計画

JSONマージ機能の追加を検討しています。

対象：

- 新規利用者追加
- 重複利用者検出
- 更新日時比較
- 上書き判定
- 統合版作成

---

## PDFBox → pdf-lib 対応表

| PDFBox / Java | pdf-lib / JavaScript |
|---------------|----------------------|
| Loader.loadPDF() | PDFDocument.load() |
| PDType0Font.load() | registerFontkit() + embedFont() |
| showText() | page.drawText() |
| drawCircle() | 「〇」描画 |
| YAML座標定義 | JSON座標定義 |

座標原点はいずれも左下基準のため、座標データはそのまま利用しています。

---

## 技術スタック

| 分類 | 技術 |
|--------|--------|
| フロントエンド | HTML / CSS / JavaScript |
| PDF生成 | pdf-lib |
| データ保存 | IndexedDB |
| データ交換 | JSON |
| パッケージ管理 | Bun |
| デスクトップ化 | Tauri 2.x |
| Rust利用範囲 | Tauri Runtime |
| サーバー | なし |

---

## 免責事項

本ツールは東京都中央区が公開する様式を参考に作成した非公式ツールです。

正式な手続きには自治体が提供する最新様式をご利用ください。

本ツールの利用によって生じた損害について、作成者は責任を負いません。
