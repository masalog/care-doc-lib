# 実装手順書 08：バックアップ（JSON書き出し・読み込み）

## 1. 目的

- 現行の IndexedDB（DB名 `caredoc`）のデータを JSON ファイルに書き出し、読み込んで復元できるようにする
- SQLite 移行（ロードマップ 15）の移行元データとしても使う
- **IndexedDB の構造は変更しない**（DBバージョン 1 のまま）

## 2. 対象データ（現行コードより）

| ストア | キー | 内容 |
|---|---|---|
| `members` | `id`（自動採番の数値） | `MEMBER_FIELDS` の19項目（すべて文字列） |
| `settings` | `id = "singleton"` | `SETTINGS_FIELDS` の15項目（すべて文字列）、1件のみ |

項目定義は `public/assets/js/models/storage-core.js` の `MEMBER_FIELDS` / `SETTINGS_FIELDS` を正とする。

## 3. 制約（必ず守る）

- **CSP を変更しない。** インラインスクリプト・`onclick` 属性は使わず、`addEventListener` で登録する
- **capabilities を変更しない**（`permissions: []` のまま）。Tauri API・プラグインは使わない
  - 書き出しは PDF 保存（`pdf-export.js`）と同じ、Blob + `<a download>` の方式
  - 読み込みは `<input type="file">` + `FileReader` / `file.text()`
- 新しいライブラリを追加しない
- 既存の `storage-core.js` / `storage-crud.js` / `storage-seed.js` の動作を変えない

## 4. ファイル構成

| ファイル | 変更 |
|---|---|
| `public/assets/js/services/backup/storage-backup.js` | **新規**。書き出し・読み込み・検証の処理 |
| `public/admin.html` | ナビに「バックアップ」を追加、セクション追加、`<script>` 追加 |
| `public/assets/js/controllers/admin.js` | `showSection` を3セクション対応に、ボタンのイベント登録を追加 |
| `public/assets/css/style.css` | 必要なら最小限の追加 |

`admin.html` の読み込み順：
```
pdf-lib.min.js → pdf-core.js → storage-core.js → storage-seed.js → storage-backup.js → admin.js
```

## 5. バックアップファイルの形式

```json
{
  "format": "caredoc-backup",
  "formatVersion": 1,
  "exportedAt": "2026-11-06T11:00:00+09:00",
  "app": "care-doc-lib",
  "members": [
    { "id": 1, "insuranceIdNumber": "...", "name": "...", "...": "..." }
  ],
  "settings": { "surveyAddress": "...", "...": "..." }
}
```

- `settings` は未保存なら `null`
- `settings` の `id`（`"singleton"`）はファイルに含めない（復元時に付与）
- 文字コード UTF-8、`JSON.stringify(data, null, 2)`
- ファイル名：`caredoc-backup_YYYYMMDD_HHmmss.json`（ローカル時刻）

## 6. 書き出し（exportBackup）

1. `db.transaction(["members", "settings"], "readonly")` の**1つのトランザクション**で
   `members.getAll()` と `settings.get("singleton")` を実行する
   （README のトラブル事例「The database connection is closing」を避けるため、途中で await を挟まない）
2. `transaction.oncomplete` で上記の形式に組み立てる
3. Blob（`application/json`）を作り、`pdf-export.js` と同じ方法でダウンロードする。URL は使用後に `revokeObjectURL`
4. 画面に「利用者 N 件・共通設定 あり/なし を書き出しました」と表示する

## 7. 読み込み（importBackup）

### 7.1 検証（validateBackup）— 1つでも違反したら中止し、DBに触れない

- ファイルサイズ 5MB 以下
- `JSON.parse` に成功する
- `format === "caredoc-backup"`、`formatVersion === 1`
- `members` が配列。各要素について：
  - オブジェクトである
  - `id` が正の整数、かつ配列内で重複しない
  - `id` 以外のキーは `MEMBER_FIELDS` に含まれるもののみ（未知のキーはエラー）
  - 値はすべて文字列（欠けている項目は `""` で補う）
  - `name` が空でない
- `settings` は `null` またはオブジェクト。キーは `SETTINGS_FIELDS` のみ、値は文字列

検証は画面処理と分けた**純粋な関数**にする（後の単体テストと Rust 側への移植のため）。

### 7.2 復元手順

1. 確認ダイアログ：「現在のデータ（利用者 X 件）をすべて置き換え、バックアップ（利用者 Y 件・保存日時 …）を復元します。よろしいですか？」
2. **復元前に、現在のデータを自動で書き出す**（`caredoc-backup_before-restore_YYYYMMDD_HHmmss.json`）。書き出しに失敗したら中止
3. `db.transaction(["members", "settings"], "readwrite")` の**1つのトランザクション**で：
   - `members.clear()` → 各利用者を `put`（`id` をそのまま保持）
   - `settings.clear()` → `settings` があれば `{ ...settings, id: "singleton" }` を `put`
4. `oncomplete` で `refreshMembers()` と `loadAdminSettings()` を実行し、完了メッセージを表示
5. `onabort` / `onerror` ではエラーを表示する（トランザクションなので途中まで書かれることはない）

### 7.3 注意：初期データの再投入

`seedIfEmpty()` は利用者が0件だと初期データ7名を投入する。そのため、**利用者0件のバックアップは読み込みを拒否する**（メッセージ：「利用者が0件のバックアップは復元できません」）。

### 7.4 復元しないもの

- 方式は「全件置き換え」のみ。差分マージは実装しない

## 8. 画面（admin.html）

ナビに `<button class="nav-btn" data-section="backup">バックアップ</button>` を追加し、次のセクションを追加する。

```html
<section id="section-backup" class="section hidden">
  <h2>バックアップ</h2>
  <p class="notice">バックアップファイルには利用者の個人情報が含まれます。
     保存場所に注意し、不要になったファイルは削除してください。</p>
  <button id="export-backup-btn" type="button" class="btn btn-primary">バックアップを書き出す</button>
  <label for="import-backup-file">バックアップから復元</label>
  <input type="file" id="import-backup-file" accept=".json,application/json">
  <div id="backup-message" class="message"></div>
</section>
```

`admin.js` の `showSection` は、`members` / `settings` / `backup` の3つを切り替えられるように直す。
メッセージ表示は既存の `showAdminMessage("backup-message", ...)` を使う。
ファイル選択後は `input.value = ""` に戻し、同じファイルを続けて選べるようにする。

## 9. 確認項目（手動テスト）

| # | 操作 | 期待結果 |
|---|---|---|
| 1 | 書き出し | JSON が保存され、件数が画面と一致する |
| 2 | 利用者を1名編集 → 1のファイルを復元 | 編集前に戻る。`before-restore` ファイルも保存される |
| 3 | 利用者を全員削除 → 1を復元 | 全員戻り、`id` も同じ。PDF作成画面でも選べる |
| 4 | 共通設定が未保存の状態で書き出し → 復元 | `settings: null` で問題なく動く |
| 5 | 壊れた JSON / 別形式の JSON / `formatVersion: 2` | 復元されず、エラーが表示される。データは変わらない |
| 6 | 未知のキー・数値の値・`id` 重複を含む JSON | 同上 |
| 7 | 利用者0件のバックアップ | 拒否される |
| 8 | 復元確認ダイアログでキャンセル | 何も変わらない |
| 9 | `bunx tauri dev` と `bunx tauri build` の両方 | ダウンロードとファイル選択が動く。開発者ツールに CSP 違反が出ない |
| 10 | 日本語（氏名・住所） | 文字化けせず往復できる |

## 10. 完了の条件

- 上の確認項目がすべて通る
- `tauri.conf.json` と `capabilities/default.json` に差分がない
- README の「主な機能」にバックアップを追記し、ロードマップ 08 を「済」にする

---

## VSCode の AI エージェントへの依頼文（貼り付け用）

```
docs/impl/08-backup.md の手順書に従って、管理画面にバックアップ（JSON書き出し・読み込み）機能を実装してください。

厳守事項：
- tauri.conf.json（CSP）と capabilities/default.json は変更しない
- Tauri API・プラグイン・新しいライブラリは使わない
- インラインスクリプトや onclick 属性は使わない
- IndexedDB の構造（DBバージョン1）と既存の storage-*.js の動作は変えない
- 書き出し・復元はそれぞれ members と settings を1つのトランザクションで扱う
- 検証処理（validateBackup）は画面処理と分けた純粋な関数にする

実装後、手順書の「9. 確認項目」をどう確認したかを報告してください。
```
