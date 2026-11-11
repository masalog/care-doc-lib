# フロントエンド資産の構成とモジュール化

| 項目 | 内容 |
|---|---|
| 状態 | 実施済 |
| 対象 | `public/assets/` 配下のフロントエンド資産 |

本書は、フロントエンド資産を役割ごとのサブフォルダに整理した結果と、JavaScriptをES Modules化した構成を示す。ファイル移動と参照先の更新、JSDocの追加、モジュール間の依存関係の明示を行った。

## 1. 基本方針

- 画面表示、画面操作、データ処理、アプリケーションサービス、外部ライブラリを区別して配置する。
- MVCの考え方をベースにする。ただし、PDF生成やバックアップのような業務処理はModelに押し込まず、Serviceとして分離する。
- ファイル数に対して過度に深い階層を作らず、関連ファイルがまとまる範囲の構成にする。
- `public/data/` にあるテンプレート、フォント、座標データはアプリケーションコードではないため、`public/assets/` に移動しない。
- 構成変更時は機能・表示・データの振る舞いを変えず、HTMLやJavaScriptからの参照パスのみを適切に更新する。

## 2. 整理後の構成案

```text
public/
├── index.html                    # PDF作成画面（View）
├── admin.html                    # 管理画面（View）
├── assets/
│   ├── css/
│   │   └── style.css             # 画面スタイル（View）
│   ├── js/
│   │   ├── dom.js                # 共通DOM参照ヘルパー
│   │   ├── controllers/
│   │   │   ├── main.js           # PDF作成画面の起動・画面操作
│   │   │   └── admin.js          # 管理画面の起動・画面操作
│   │   ├── models/
│   │   │   ├── storage-core.js   # データ定義・ストレージ基盤
│   │   │   ├── storage-crud.js   # 利用者・設定のデータ操作
│   │   │   └── storage-seed.js   # 初期データ・初期化
│   │   └── services/
│   │       ├── pdf/              # PDF生成・描画・出力
│   │       └── backup/           # バックアップ・復元
│   └── vendor/
│       ├── pdf-lib.min.js
│       └── fontkit.umd.min.js
└── data/
    ├── template.pdf
    ├── NotoSansJP-Regular.ttf
    └── positions.json
```

`services/pdf/` には `pdf-core.js`、`pdf-draw.js`、`pdf-export.js` を、`services/backup/` には `storage-backup.js` を配置する。`storage-backup.js` は永続化に関係する機能だが、JSONの書き出し・検証・復元というユースケースを担うため、通常のデータアクセス処理とは分けてServiceとして扱う。

## 3. MVC上の責務

| 区分 | 配置 | 責務 |
|---|---|---|
| View | HTML、`assets/css/` | 画面構造と表示。業務処理や永続化処理を持たない |
| Controller | `assets/js/controllers/` | ユーザー操作を受け取り、ModelやServiceを呼び出して画面を更新する |
| Model | `assets/js/models/` | 利用者・設定データの扱いと永続化を担う。将来SQLiteへ移行する際も、画面から保存方式を直接扱わせない |
| Service | `assets/js/services/` | PDF生成・出力、バックアップ・復元など、複数の画面操作から利用されるアプリケーション処理を担う |
| Vendor | `assets/vendor/` | アプリ外部のライブラリを配置する。アプリ固有ロジックを置かない |

## 4. 依存関係と読み込み

- ControllerはModelおよびServiceを利用する。ModelやServiceからControllerを呼び出さない。
- ViewはControllerやライブラリを、明示した順序で読み込む。
- HTMLは各画面のControllerを`<script type="module">`で読み込み、アプリケーションコード間の依存は`import`で表す。外部UMDライブラリは従来どおり通常の`script`要素で先に読み込む。
- JavaScript内の相対`fetch()`先は、通常、スクリプトファイルの場所ではなくドキュメントの基準URL（`document.baseURI`）から解決される。移動後も現在のHTMLとTauriの配信URLを前提に参照先を確認し、`public/data/` のアセットが正しく読めることを確認する。
- Tauriのフロントエンド配信元は`public/`である。ビルド後もCSS、JavaScript、PDFテンプレート、フォント、座標データが読み込めることを確認する。

## 5. ES Modulesの設計方針

アプリケーションJavaScriptはブラウザー標準のES Modulesを使い、ビルドツールを追加せずに画面ごとのエントリーポイントから依存を`import`する。

- `index.html`と`admin.html`は、それぞれの画面コントローラーだけを`<script type="module">`で読み込む。依存する自作JavaScriptはエントリーポイントから静的に`import`する。
- `controllers/`は画面初期化を担当し、`models/`と`services/`が提供する必要な関数だけを明示的にインポートする。画面起動処理は各コントローラーのエントリーポイントに閉じる。
- データ項目定義とIndexedDB操作はModel、PDF生成状態はPDF Serviceが所有する。変更される状態は所有モジュールの関数を通じて更新し、他モジュールから直接書き換えない。
- PDFライブラリなど`assets/vendor/`の既存UMDライブラリは通常の`script`要素で読み込み、アプリケーションのモジュール化とは分けて扱う。モジュールからは`window.PDFLib`などグローバル参照を明示する。外部ライブラリ自体をES Modules版へ置き換える場合は別途判断する。
- `type="module"`は遅延実行され、モジュールは独自スコープを持つ。画面イベントなどの初期化処理はControllerまたは明示的に読み込まれるServiceに置き、`import`関係で依存と実行順を表す。
- モジュールの相対`import`先は各モジュールファイルのURLを基準にする。一方、PDFアセット取得の相対`fetch()`先はドキュメント基準のままなので、Tauriとローカルサーバーの両方で参照先を確認する。
- TauriのCSP、配信方式、ビルド成果物が同一オリジンのモジュール読み込みを許可することを確認する。ブラウザーでの動作確認には、`file://`ではなくローカルサーバーを使う。

## 6. 資産整理で実施したこと

1. ファイルを上記の責務に沿って配置した。
2. `index.html`と`admin.html`の参照を更新し、各画面のES Moduleエントリーポイントからアプリケーションコードを読み込むようにした。外部UMDライブラリは通常の`script`要素で読み込む。
3. `public/data/`の参照はHTMLドキュメント基準の相対パスのまま維持した。
4. READMEの構成図およびファイル説明を実際の配置に更新した。
5. 各アプリケーションJavaScriptに、ファイル概要、関数の役割、引数・戻り値などのJSDocを追加した。
6. MVCの責務をコード上で完全に再設計する作業は対象外とし、既存機能を維持したまま配置と依存関係を明確にした。

## 7. 動作確認

- JavaScriptモジュールの構文と相対`import`先を確認した。
- ブラウザーでPDF作成画面を起動し、利用者の選択とPDF生成・プレビューを確認した。
- 管理画面でバックアップファイルの復元と、復元後の利用者一覧・設定の再読み込みを確認した。
- `bunx tauri build`で配布用ビルドを確認した。
