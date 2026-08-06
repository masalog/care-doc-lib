# care-doc-pwa — pdf-lib 版

CareDocWeb（Java / Spring Boot + Apache PDFBox + AWS Lambda）の **PDF生成部分を、ブラウザだけで完結する pdf-lib 構成に移植**し、PWA化・データ保存・静的ホスティング対応までを行ったものです。
サーバー不要・データ外部送信なし（ゼロデータ）で、介護認定申請書テンプレPDFの座標上に入力データをレンダリングします。

---

## 構成

```
care-doc-pwa/
├── public/                      # ★デプロイ対象（これだけを配信する）
│   ├── index.html               #   本体マークアップ（フォーム入力 → PDF生成・プレビュー・保存）
│   ├── manifest.webmanifest     #   PWAマニフェスト（ルート固定）
│   ├── sw.js                    #   Service Worker（オフライン対応・ルート固定）
│   ├── _headers                 #   Cloudflare Pages/Netlify 用キャッシュ・セキュリティ設定
│   ├── assets/                  #   アプリのコード・ライブラリ
│   │   ├── styles.css           #     スタイル（ベージュ＋オレンジ配色）
│   │   ├── app.js               #     全ロジック（PDF生成・IndexedDB保存・PWA登録）
│   │   ├── pdf-lib.min.js       #     PDF描画ライブラリ
│   │   └── fontkit.umd.min.js   #     日本語フォント埋め込み用
│   ├── data/                    #   テンプレ・フォント・座標
│   │   ├── template.pdf         #     介護認定申請書テンプレPDF（A4縦 595.32×842.04）
│   │   ├── NotoSansJP-Regular.ttf #   埋め込み用日本語フォント（約5.4MB）
│   │   └── positions.json       #     座標データ（47フィールド・元YAMLと同一値）
│   └── icons/                   #   アプリアイコン
│       ├── icon.svg
│       ├── icon-192.png
│       └── icon-512.png
│
├── .gitignore
└── README.md
```

> デプロイするのは `public/` の中身だけです。
> `index.html` / `sw.js` / `manifest.webmanifest` / `_headers` は動作の都合で `public/` 直下（ルート）に固定。特に `sw.js` はサブフォルダに置くとキャッシュ制御スコープが `public/` 全体に及ばなくなるため、必ずルートに置きます。

---

## ローカルでの起動・確認

`fetch()` で同フォルダのファイルを読むため、**file:// では動きません。ローカルサーバー経由で開きます。**

→ Chrome で `http://localhost:5500` を開く（`Ctrl + F5` で強制再読み込み推奨）

### 起動後の確認
- 上部に `座標:OK(47) / テンプレ:OK / フォント:OK`、下部に「準備完了」→ 読込成功
- 生成前は右側にプレースホルダー（書類アイコン＋案内文）を表示
- 「PDFを生成してプレビュー」→ 右にPDF表示（出ない場合は「新しいタブでPDFを開く」）
- エラー時は画面上部に赤帯で内容表示

---

## 主な機能

- **座標指定でのPDF生成**: テンプレPDFの47フィールドに、フォーム入力値を座標指定で描画
- **年は西暦で入力・印字**（テンプレの年欄は元号印字のない自由記入欄）
- 性別・要介護度は「〇」で該当欄を囲む
- **データ保存（IndexedDB）**: 利用者（複数）＋共通設定（1件）を端末内に保存（後述）
- **PWA**: インストール可能・オフライン動作
- **PDFファイル名**: 保存時に `YYYY年M月D日_氏名_介護認定申請書.pdf` を自動生成（例: `2026年8月6日_田中一郎_介護認定申請書.pdf`）。氏名の空白は詰め、未入力時は「無名」

---

## 配色（ベージュ＋オレンジ）

`assets/styles.css` の CSS 変数で管理:

| 用途 | 色 |
|---|---|
| 背景 | ベージュ `#f5efe6` |
| カード | 明るいベージュ `#fbf7f0` |
| アクセント（ボタン・見出し・フォーカス枠） | オレンジ `#e8843d` |
| 淡いアクセント（免責バー・ホバー） | 淡オレンジ `#fce4cf` |
| 文字 | ダークブラウン `#3f3a34` |

---

## データ保存（IndexedDB・端末内のみ）

入力データはブラウザの IndexedDB に保存され、**外部サーバーへは一切送信されません**（ゼロデータ維持）。
元の CareDocWeb の構造に合わせ、2種類に分けて保存します:

- **利用者データ**（複数保存）: 氏名・被保険者番号・生年月日・住所・要介護度・有効期間・入所日など、人ごとに変わる項目。
  - 「保存済み利用者」のプルダウンで選択 → フォームに自動入力
  - 「この利用者を保存/更新」で登録・上書き、「削除」で削除
- **共通設定**（1件のみ）: 調査場所・施設・代行者・主治医など事業所で共通の項目。
  - 「共通設定を保存」で保存、次回起動時に自動復元

保存先は DB 名 `caredoc`、ストア `members`（利用者）/ `settings`（共通設定）。
初回起動時、利用者データが空なら CareDocWeb のエクスポートデータ（利用者7名＋共通設定1件）を自動投入します（`app.js` の `seedIfEmpty()`）。
ブラウザのデータを消去すると保存内容も消えます。端末間の同期はありません。

---

## デプロイ前チェックリスト

- [x] 公開用に `public/` へ整理（assets / data / icons のサブフォルダ構成）
- [x] `_headers` でキャッシュ・セキュリティヘッダ設定
- [x] 免責事項を画面上に表示（公的文書のため）
- [x] PWA化（manifest + Service Worker + アイコン）
- [x] データ保存（IndexedDB・利用者7名/共通設定を初期投入）
- [ ] 本番URL（サブパス配信の場合）でアセットパスが解決するか確認
- [ ] iOS Safari / Android Chrome での表示・インストール確認


## Cloudflare Pages へのデプロイ

### 方法A: Git連携（推奨・自動デプロイ）
1. このプロジェクトをGitHub等にpush
2. Cloudflareダッシュボード → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. リポジトリを選択し、ビルド設定を以下に:
   - **Framework preset**: `None`
   - **Build command**: （空欄）
   - **Build output directory**: `public`
4. **Save and Deploy** → 数十秒で `https://<project>.pages.dev` が発行される
5. 以降、pushするたびに自動デプロイ

### 方法B: 直接アップロード（Gitなし）
1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. `public/` フォルダの中身をドラッグ&ドロップ
3. Deploy

### 方法C: Wrangler CLI
```bash
npm install -g wrangler
wrangler pages deploy public --project-name caredoc
```

### デプロイ後の確認
- HTTPSで開く（PWA/Service Workerに必須。Cloudflareは自動HTTPS）
- DevTools → Application → Manifest / Service Workers が認識されているか
- オフライン（機内モード）でも一度開いたページが動くか
- 「ホーム画面に追加 / インストール」が出るか

---

## PDFBox → pdf-lib 対応表

| 現状（PDFBox / Java） | 本アプリ（pdf-lib / JS） |
|---|---|
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
|---|---|---|
| 右側が真っ白・ボタン無反応 | ライブラリ+フォントを全部Base64で1ファイル（約8MB）に埋め込み、ブラウザが固まった | ファイルを分割しローカルサーバーで配信 |
| 日本語が □ / 空白 | `embedFont` の `subset:true` でグリフ欠落 | `subset:false` に変更 |
| アセットが読めない | `file://` で開き `fetch` が制限される | ローカルサーバー / 本番URLで開く |
| PDFがプレビュー枠に出ない | Chrome が data: URI 埋め込みPDFをブロック | `blob:` URL + iframe に変更、別タブでも開けるように |
| フッター下端で文字が透ける | stickyフッターの負マージンで下端に隙間 | 負マージンを廃止し、パネル下パディングをフッターに委譲 |

---

## 今後の拡張候補（未実装）

- 管理画面（利用者の登録・編集・削除の専用UI）の拡充
- 座標の微調整（項目ごとの位置ズレがあれば positions.json を補正）
- クラウド同期（現状は端末内のみ）

---

## 技術スタック

| 分類 | 技術 |
|------|------|
| フロントエンド | HTML / CSS / Vanilla JavaScript（index.html / assets/styles.css / assets/app.js に分割） |
| PDF生成 | pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 |
| フォント | Noto Sans JP（埋め込み・`subset:false`） |
| データ保存 | IndexedDB（利用者 `members` / 共通設定 `settings`・端末内のみ） |
| PWA | Web App Manifest + Service Worker（cache-first） |
| ホスティング | 静的（Cloudflare Pages 等）／サーバーなし・ゼロデータ |
