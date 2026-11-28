# 実装設計書 09：認証・認可・画面ロック・操作者識別

- **前提**：[ADR-004：認証・認可および操作者識別の基本方針](../adr/ADR-004-authentication-authorization.md)
- **対象**：Windows Tauri デスクトップ版（HTML / CSS / JavaScript + IndexedDB）
- **状態**：実装済（改訂反映）

---

## 1. 目的とスコープ

### 1.1 実装対象
1. **認証（Authentication）**：アカウントID＋4桁の数字 PIN によるログイン／ログアウト、初回セットアップ、連続失敗ロックアウト
2. **認可（Authorization・1ロール）**：認証済みかつアンロック状態のセッションのみ、画面表示・データ操作・PDF生成・バックアップを許可する認証ガード
3. **15分無操作ロック**：最終操作から 15 分経過で画面をロックし、PIN 再入力で解除する
4. **操作者識別（案A）**：ヘッダーへのログイン中ユーザー表示、および利用者データ・共通設定への作成者／更新者（`createdBy` / `updatedBy`）記録
5. **アカウント管理**：アカウントの追加、表示名変更、PIN 変更、削除（無効化状態は設けない）

### 1.2 対象外（今回実装しないもの）
- 複数ロール（管理者専用・監査担当者専用）による機能制限
- 独立した操作履歴（監査ログ）ストアおよび改ざん検知・5年保持（[ADR-004](../adr/ADR-004-authentication-authorization.md) 参照）
- IndexedDB 内データの独自暗号化（[ADR-003](../adr/ADR-003-data-protection.md) 継続）
- バックアップファイルへのアカウント情報・PIN ハッシュの書き出し

---

## 2. 制約（現行構成の維持）

- **CSP（`tauri.conf.json`）を変更しない**
  - インラインスクリプト・`onclick` 等は使用せず、外部 JS モジュールと `addEventListener` で実装する
- **Tauri capabilities（`src-tauri/capabilities/default.json`）を変更しない**（`permissions: []` のまま）
- **Rust 側に認証・DB ロジックを追加しない**
- **外部ライブラリを追加しない**
  - PIN ハッシュ・乱数生成はブラウザ標準の Web Crypto API（`window.crypto`）を使用する
- **既存バックアップ形式（`caredoc-backup` v1）との互換性を維持する**（6章参照）

---

## 3. データ設計

### 3.1 IndexedDB ストア構成（DBバージョン更新）

現行の `caredoc` DB（バージョン `1`：`members`, `settings`）をバージョン `2` へ上げ、`accounts` ストアを追加する。既存の `members`・`settings` のデータはマイグレーション時に破棄せずそのまま保持する。

#### `accounts` ストア（新規）
- `keyPath`: `"accountId"`

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `accountId` | string | ○ | ログインID（半角英数字・`-`・`_`、前後空白不可、小文字正規化または大文字小文字区別方針を統一。例：小文字統一） |
| `displayName` | string | ○ | 画面・更新者表示に使う氏名／表示名 |
| `role` | string | ○ | 固定値 `"staff"`（将来拡張用フィールド） |
| `passwordHash` | string | ○ | Base64 エンコード済みハッシュ値 |
| `passwordSalt` | string | ○ | Base64 エンコード済みランダムソルト（16バイト以上） |
| `hashAlgorithm` | string | ○ | `"PBKDF2-SHA256"` |
| `hashIterations` | number | ○ | 例：`100000`（実装定数として保持し将来の引き上げに備える） |
| `failedCount` | number | ○ | 連続ログイン失敗回数（初期値 `0`） |
| `lockedUntil` | string \| null | | 連続失敗時の一時ロック解除時刻（ISO 8601。ロックなしは `null`） |
| `createdAt` | string | ○ | 作成日時（ISO 8601） |
| `updatedAt` | string | ○ | 更新日時（ISO 8601） |

#### `members` / `settings` への操作者識別フィールド追加（案A）
画面フォーム項目定義（[storage-core.js](../../public/assets/js/models/storage-core.js) の `MEMBER_FIELDS` / `SETTINGS_FIELDS`）自体は変更せず、保存時に以下のメタデータを付与する。

| フィールド | 型 | 説明 |
|---|---|---|
| `createdBy` | string | 作成時の `accountId`（既存データ移行前は空文字または `"legacy"` 扱い） |
| `createdByName` | string | 作成時の `displayName` |
| `createdAt` | string | 作成日時（ISO 8601） |
| `updatedBy` | string | 最終更新時の `accountId` |
| `updatedByName` | string | 最終更新時の `displayName` |
| `updatedAt` | string | 最終更新日時（ISO 8601） |

> **ポイント**：`applyFields()` やフォーム収集（`collectFields()`）が `MEMBER_FIELDS` / `SETTINGS_FIELDS` だけを参照するため、メタデータ列を追加しても既存のフォーム読込・PDF描画には影響しない。一覧画面や選択表示にのみ `updatedByName` / `updatedAt` を表示する。

---

### 3.2 PIN 仕様・ハッシュ方式

- **PIN 平文は保存しない**（IndexedDB・`sessionStorage`・コンソールログのすべてに出力しない）。
- **ハッシュ導出**：Web Crypto API `crypto.subtle.importKey` + `crypto.subtle.deriveBits`（PBKDF2 / SHA-256 / ソルト 16 バイトランダム生成 / 反復回数 100,000 回 / 出力 256 bit）。
  - ※IndexedDB スキーマ上の保存フィールド名（`passwordHash`, `passwordSalt` 等）は内部名として維持する。
- **比較**：デコードしたバイト列を長さチェックのうえ定数時間比較（XOR 累積）で照合する。
- **PIN 要件**：
  - 半角数字 4 桁固定（`^\d{4}$`）
  - 同一数字の 4 桁繰り返し（例：`0000`〜`9999` のゾロ目）や単純な連番（`1234`, `4321`, `0123`, `3210` 等）は不可とする
  - 入力欄には `type="password"` / `inputmode="numeric"` / `maxlength="4"` / `pattern="[0-9]{4}"` を併用し、マスク表示と数字入力補助を行う

---

### 3.3 セッション管理（`sessionStorage`）

現在 CareDocLib は [index.html](../../public/index.html) と [admin.html](../../public/admin.html) の 2 画面構成でページ遷移する。画面遷移時に認証状態を維持し、かつアプリ終了（Tauri ウィンドウ終了）時に自動破棄させるため、セッション状態は `sessionStorage` に保持する。

キー例：`caredoc.auth.session`

```json
{
  "accountId": "tanaka",
  "displayName": "田中",
  "role": "staff",
  "loggedInAt": "2026-11-27T22:10:00+09:00",
  "lastActivityAt": 1795785000000,
  "locked": false
}
```

- **タイムアウト判定基準**：`Date.now() - lastActivityAt >= 15 * 60 * 1000`（900,000 ms）
- `sessionStorage` に値が存在しない、JSON が不正、または DB 上に該当アカウントが存在しない場合は**未認証**として扱う。

---

## 4. 画面遷移・認証・認可フロー

### 4.1 起動・ページ表示フロー（`index.html` / `admin.html` 共通）

両ページの初期化処理（`main.js` / `admin.js`）は、業務データ（`seedIfEmpty()`, `loadMemberList()`, `loadSettings()`, `refreshMembers()`）を画面へ描画する**前**に認証ガードを実行する。

```text
ページ読込（index.html / admin.html）
  ↓
openDB()（IndexedDB v2 へ接続・必要時アップグレード）
  ↓
accounts 件数を確認
  ├─ 0件 → 【初回セットアップUI】を表示（最初のアカウント登録）
  │         └─ 登録完了 → セッション確立 → 業務UI初期化へ
  └─ 1件以上
        ↓
     sessionStorage のセッション & DB上のアカウント存在を検証
        ├─ 未認証 → 【ログインUI】を表示（業務UIは非表示・データ未読込）
        ├─ セッションあり & 15分以上経過 or locked=true → 【ロック画面UI】を表示
        └─ 有効セッション & 15分以内 → 業務UIを表示・データ読込・ロック監視開始
```

> **設計上の注意（重要）**：
> - 未認証状態で業務セクションがチラついたり、DOM 上に利用者一覧が読み込まれたりしないよう、初期状態では業務メイン領域（`<main>` 等）を隠し、認証確認完了後に表示する。
> - `seedIfEmpty()` は**認証完了後**、または初回セットアップ完了後に実行する（未ログイン状態で個人情報を描画・操作させない）。

---

### 4.2 認可ガード（データ操作・PDF生成の入口チェック）

画面要素を隠すだけでなく、データ操作・PDF生成・バックアップの入口となる関数でもセッション状態を検証する。

```js
// 例：auth-session.js が提供する共通ガード
export async function requireActiveSession() { ... }
```

- 以下の操作を実行する前に `requireActiveSession()` を呼び出す：
  - 利用者の参照（一覧・詳細読込）、新規登録、更新、削除
  - 共通設定の読込、保存
  - PDF 生成、ダウンロード、別タブ表示
  - バックアップ書き出し、バックアップ復元
  - アカウントの追加、編集、PIN 変更、削除
- 未認証・ロック中・アカウント不在を検知した場合は、エラーを投げて処理を中断し、ログイン／ロック画面へ遷移する。

---

### 4.3 ログイン・連続失敗ロックアウト

1. アカウントID・4桁の PIN を入力してログインする。
2. **エラーメッセージの原則**：ID 不一致・PIN 不一致のいずれであっても、ログイン画面上では「アカウントIDまたはPINが正しくありません」とし、アカウント存在有無を過度に露出しない。
3. **連続失敗によるロックアウト**：4桁 PIN は候補数が限られるため、同一アカウントで **5 回連続失敗したら 1 時間（3,600,000 ms）** ログインおよびロック解除を制限する。成功時に `failedCount = 0`・`lockedUntil = null` へリセットする。

---

### 4.4 15分無操作ロックの仕様

- **操作イベント監視**：`pointerdown`, `keydown`, `input`, `change`, `scroll` を監視し、一定間隔（例：5秒〜10秒スロットリング）で `sessionStorage` の `lastActivityAt` を更新する。
- **定期チェック**：タイマー（例：15秒〜30秒ごと）および `visibilitychange`（PC スリープ復帰・ウィンドウ再表示時）に `Date.now() - lastActivityAt >= 900000` を判定する。
- **ロック時の動作**：
  1. `sessionStorage` の `locked` を `true` に更新する。
  2. 画面全体を覆うロック用モーダル／オーバーレイを表示する（背後の業務内容を隠す）。
  3. **入力中のフォーム値自体はブラウザメモリ上に保持**し、解除後に作業を継続できるようにする（別ユーザーとしてログインする場合は「ログアウトして別アカウントでログイン」を選択し、リロードして初期化する）。
- **ロック解除時の動作**：
  1. 現在の `accountId` に対して 4 桁の PIN を再入力し、`accounts` ストアのハッシュと照合する（連続 5 回失敗時は同様に 1 時間ロックアウト）。
  2. 一致したら `locked = false`・`lastActivityAt = Date.now()` に更新してオーバーレイを閉じる。
  3. 解除中も `requireActiveSession()` により背後の操作実行はすべてブロックされる。

---

### 4.5 アカウント管理（1ロール運用）

[admin.html](../../public/admin.html) のナビゲーションに「アカウント管理」セクション（または認証関連パネル）を追加する。

- **一覧表示**：`accountId`, `displayName`, `updatedAt`
- **新規アカウント作成**：`accountId`, `displayName`, 初期 PIN（4桁数字＋確認入力）
- **表示名変更**：対象アカウントの `displayName` を更新
- **PIN 変更**：
  - 自分の PIN 変更：現在の PIN 確認＋新しい PIN（＋確認入力）
  - 他アカウントの PIN 再設定（1ロール運用における端末内復旧手段）：現ログインユーザーの PIN 再確認のうえで再設定可能とする（誤操作・なりすまし防止）
- **削除**：
  - 2 件以上のアカウントがある場合は確認ダイアログ後に削除する。
  - **最後の 1 件を削除する場合**：初回アカウント登録へ戻る（保存済みの利用者データ・共通設定は保持される）ため、誤操作・乗っ取り防止として **現在の 4 桁 PIN の再入力** を必須とする。
  - 自分自身（最後の 1 件を含む）を削除した場合は即座にセッションを破棄して再読み込みする。
  - なお、アカウントを削除しても既存の `members` / `settings` に記録済みの `createdBy` / `updatedByName` はそのまま保持される。

---

## 5. 画面・モジュール構成案

### 5.1 新規・変更ファイル構成

| ファイル | 区分 | 役割 |
|---|---|---|
| `public/assets/js/models/storage-core.js` | 変更 | IndexedDB バージョン `2` 対応、`accounts` ストア作成、メタデータ付与補助 |
| `public/assets/js/models/auth-store.js` | **新規** | `accounts` ストアの CRUD・削除 |
| `public/assets/js/services/auth/password-hash.js` | **新規** | Web Crypto API による PBKDF2 ハッシュ生成・定数時間検証・4桁 PIN 検証 |
| `public/assets/js/services/auth/auth-service.js` | **新規** | 初回セットアップ、ログイン/ログアウト、1時間ロックアウト、15分ロック判定、`requireActiveSession()` |
| `public/assets/js/controllers/auth-ui.js` | **新規** | ログイン／初回セットアップ／ロックオーバーレイ／ヘッダー表示／15分タイマーの共通制御 |
| `public/assets/js/models/storage-crud.js` | 変更 | 読み書き時の `requireActiveSession()` 呼び出し、`createdBy` / `updatedBy` 付与 |
| `public/assets/js/models/storage-seed.js` | 変更 | 認証完了後の初期データ投入と操作者メタデータ付与 |
| `public/assets/js/services/pdf/pdf-draw.js` / `pdf-export.js` | 変更 | PDF 生成・出力入口での `requireActiveSession()` 呼び出し |
| `public/assets/js/services/backup/storage-backup.js` | 変更 | バックアップ入口での認証ガード、書き出し/復元時のメタデータ分離（6章） |
| `public/index.html` / `public/admin.html` | 変更 | 認証オーバーレイ領域、ヘッダーのユーザー表示・ロック・ログアウトボタン、管理画面にアカウント管理セクション追加 |
| `public/assets/js/controllers/main.js` / `admin.js` | 変更 | 起動時認証ガード連携、アカウント管理イベント登録 |
| `public/assets/css/style.css` | 変更 | ログイン画面・ロック画面オーバーレイ・アカウント一覧の最小限スタイル |

---

## 6. 既存バックアップ機能（08-backup）との整合仕様

[storage-backup.js](../../public/assets/js/services/backup/storage-backup.js) の `validateBackup()` は、`members` では `["id", ...MEMBER_FIELDS]`、`settings` では `SETTINGS_FIELDS` 以外のキーを **未知の項目としてエラーにする** 設計になっている（`docs/impl/test-data/NG4_未知のキー.json` 等）。

互換性を壊さないため、以下の方針とする。

1. **書き出し（`exportBackup`）**：
   - `members` の各要素からは `id` と `MEMBER_FIELDS` のみを抽出して JSON へ出力する（`createdBy` / `updatedBy` 等の管理メタデータは出力しない）。
   - `settings` も `SETTINGS_FIELDS` のみを抽出して出力する。
   - `accounts` ストアはバックアップ JSON に含めない。
2. **復元（`importBackup`）**：
   - 現行の `validateBackup()` の仕様を変更せず、既存の `caredoc-backup` v1 ファイルをそのまま復元できる状態を維持する。
   - 復元実行時（`put` 時）に、各レコードの `createdBy` / `updatedBy` へ**復元を実行したログインユーザー**と現在日時を自動付与する。
3. **権限チェック**：
   - `exportBackup()` および `importBackup()` の先頭で `requireActiveSession()` を実行する。

---

## 7. 既存データの移行・互換性

- すでにバージョン `1` の IndexedDB（`caredoc`）を利用している端末では、`onupgradeneeded`（`oldVersion < 2`）で `accounts` ストアのみを追加する。
- 既存の `members`・`settings` レコードは削除せず維持する。
- 既存レコードに `updatedBy` / `updatedByName` が無い場合は、画面上「（未記録）」等として表示し、次回更新時にログインユーザーの情報を記録する。

---

## 8. 確認項目（テスト観点）

| # | 分類 | 操作・条件 | 期待結果 |
|---|---|---|---|
| 1 | 初回起動 | `accounts` が 0 件の状態で起動 | 初回アカウント登録画面のみ表示され、業務データは見えない。登録後にログインできる |
| 2 | ログイン | 正しい ID / 4桁PIN でログイン | 業務画面が表示され、ヘッダーにログイン中ユーザー名が表示される |
| 3 | ログイン失敗 | 誤った PIN を連続 5 回入力 | エラーが表示され、1 時間ロックアウトされる。時間経過後の成功でリセットされる |
| 4 | 最後の1件削除 | アカウントが 1 件のみの状態で削除を実行 | PIN 再入力が求められ、正しい PIN で削除すると初回登録画面へ戻る（利用者データは保持） |
| 5 | 2画面遷移 | `index.html` → `admin.html` → `index.html` へ遷移 | 再ログインなしでセッションが維持される |
| 6 | 認可ガード | 未認証／ロック状態でデータ操作・PDF生成・バックアップ関数を直接呼ぶ | ガードにより拒否され、DB 読み書きや PDF 出力が行われない |
| 7 | 15分ロック | ログイン後 15 分間無操作（または PC スリープ復帰で 15 分超） | ロック画面が表示され、背後が操作不可になる。入力中フォームは破棄されない |
| 8 | ロック解除 | ロック画面で正しい PIN を入力／誤った PIN を入力 | 正しい場合のみ解除されて作業再開できる。別ユーザーへの切替はログアウト経由になる |
| 9 | 操作者識別 | ユーザーAで新規登録・更新後、ユーザーBで別レコードを更新 | 各レコードの `createdBy` / `updatedBy` 等が正しく記録・表示される |
| 10 | アカウント管理 | アカウント追加、表示名変更、PIN 変更、他アカウント削除、自分自身削除 | 各操作が反映され、PIN 変更後は新 PIN でのみログインでき、削除済みアカウントではログインできない |
| 11 | バックアップ互換 | 操作者メタデータ付きの DB から JSON 書き出し → 復元、および既存 `OK_caredoc-backup_seed.json` 復元 | `caredoc-backup` v1 として正常に往復でき、`NG4_未知のキー.json` 等の既存検証も維持される |
| 12 | 環境・セキュリティ | `bunx tauri dev` / `bunx tauri build` で実行し DevTools を確認 | CSP 違反エラーが出ず、`capabilities` 未変更で動作する |

---

## 9. 次フェーズ以降の検討事項（本実装の完了後）

- [README.md](../../README.md) のロードマップおよびセキュリティ関連ドキュメント（[SECURITY.md](../../SECURITY.md)）への反映
- 将来「誰が削除したか・誰がPDFを出力したか」まで追跡したくなった場合は、本設計を土台として簡易作業履歴ストア（案B）を追加する
