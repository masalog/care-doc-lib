import { $ } from "../../dom.js";

/**
 * PDF生成モジュールが共有する状態、画面ヘルパー、アセット初期化を提供する。
 * pdf-libを先に読み込むこと。
 * @fileoverview PDF機能が複数スクリプト間で共有する状態とヘルパー。
 */
const PDFLib = window.PDFLib;

/**
 * PDFテンプレート
 * 起動時は未読込なので null
 * @type {Uint8Array|null}
 */
let templateBytes = null;

/**
 * 日本語フォント
 * bootstrap() 実行後に値が入る
 * @type {Uint8Array|null}
 */
let fontBytes = null;

/**
 * PDFへ文字を描画する位置情報
 * positions.json 読込後に設定される
 * @type {Object|null}
 */
let layout = null;

/**
 * 最後に生成したPDF
 * PDF生成前は存在しない
 * @type {Uint8Array|null}
 */
let lastPdfBytes = null;

/**
 * PDFプレビュー用URL
 * PDF生成後に作成される
 * @type {string|null}
 */
let lastUrl = null;

/**
 * 共通または管理画面のステータスを更新する。
 * @param {string} msg 表示するメッセージ
 * @param {boolean} [ok=false] 成功状態として表示する場合はtrue
 * @returns {void}
 */
export function setStatus(msg, ok = false) {

  // status要素を取得
  let statusElement = $("status");

  // status要素が無い場合はadmin-statusを利用
  if (!statusElement) {
    statusElement = $("admin-status");
  }

  // 表示領域が存在しない場合は処理終了
  if (!statusElement) {
    return;
  }

  // メッセージを表示
  statusElement.textContent = msg;

  // 成功時と通常時で文字色を切り替える
  if (ok) {
    statusElement.style.color = "var(--ok)";
  } else {
    statusElement.style.color = "var(--muted)";
  }
}

/**
 * PDF画面のエラーバナーを表示する。
 * 
 * 呼び出し時に渡されたメッセージで表示内容を更新し、
 * 非表示状態のバナーを表示状態にする。
 * 
 * @param {string} msg 表示するメッセージ
 * @returns {void}
 */
export function showBanner(msg) {

  // バナー表示領域を取得
  const b = $("banner");

  // バナー領域が存在しない場合は終了
  if (!b) return;

  // 表示するメッセージを設定
  b.textContent = msg;

  // 非表示状態(display:none)のバナーを表示する
  b.style.display = "block";
}

/**
 * 指定した入力要素の前後空白を除いた値を返す。
 * @param {string} id 入力要素のID
 * @returns {string} 入力値。要素がない場合は空文字列
 */
export function getFormValue(id) {

  // 指定したIDの要素を取得
  const element = $(id);

  // 要素が存在しない場合
  if (!element) {
    return "";
  }

  // 入力値を取得
  const value = element.value;

  // 前後の空白を削除して返す
  return value.trim();
}

/**
 * URLからJSONまたはバイナリデータを取得する。
 * @param {string} url 取得先URL
 * @param {boolean} [asJson=false] JSONとして解析する場合はtrue
 * @returns {Promise<unknown|Uint8Array>} 取得したJSONデータまたはバイト列
 * @throws {Error} HTTPレスポンスが成功でない場合
 */
async function tryFetch(url, asJson = false) {
  // URLへHTTPリクエストを送信
  const res = await fetch(url);

  // ステータスコードが成功(200番台)でない場合はエラーを発生させる
  if (!res.ok) {
    throw new Error(url + " が読み込めません (" + res.status + ")");
  }

  // asJson=true の場合はJSONとして解析して返す
  if (asJson) {
    return await res.json();
  }

  // それ以外の場合はレスポンスをArrayBufferで取得し、
  // Uint8Array（バイト配列）に変換して返す
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return bytes;  
}

/**
 * アプリ起動時の初期化処理
 *
 * 読み込むもの：
 * - PDF編集ライブラリ(pdf-lib)
 * - 座標設定ファイル(positions.json)
 * - テンプレートPDF(template.pdf)
 * - 日本語フォント(NotoSansJP-Regular.ttf)
 * 
 * @returns {Promise<void>}
 */
export async function bootstrap() {

  // pdf-lib が読み込まれているか確認
  // 読み込めていない場合は以降の処理を中止
  if (!PDFLib) {
    showBanner(
      "PDFライブラリが読み込めていません。pdf-lib.min.js の配置を確認してください。"
    );
    return;
  }

  try {

    // ==========================================
    // 必要なアセット（外部ファイル）を読み込む
    // ==========================================

    // PDFに文字を配置するための座標情報(JSON)
    layout = await tryFetch("data/positions.json", true);

    // PDFテンプレート本体
    // Uint8Array として取得される
    templateBytes = await tryFetch("data/template.pdf");

    // PDFに埋め込む日本語フォント
    // Uint8Array として取得される
    fontBytes = await tryFetch("data/NotoSansJP-Regular.ttf");

    // 設定されている入力項目数を取得
    const n = Object.keys(layout.fields).length;

    // 画面上にアセット読込成功を表示
    if ($("assets")) {
      $("assets").textContent =
        "座標:OK(" + n + ") / テンプレ:OK / フォント:OK";
    }

    // 初期化完了メッセージ
    setStatus(
      "準備完了。『PDFを生成してプレビュー』を押してください",
      true
    );

  } catch (e) {

    // ==========================================
    // 読み込み失敗時
    // ==========================================

    if ($("assets")) {
      $("assets").textContent = "アセット読込エラー";
    }

    // エラー内容をユーザーへ表示
    showBanner(
      "アセット読込エラー: " +
      e.message +
      " — ローカルサーバー経由で開いてください（file:// では動きません）。"
    );
  }
}

/**
 * 読み込み済みPDFアセットを取得する。
 * @returns {{layout: object|null, templateBytes: Uint8Array|null, fontBytes: Uint8Array|null}}
 */
export function getPdfAssets() {
  return { layout, templateBytes, fontBytes };
}

/**
 * PDF生成に利用するライブラリを返す。
 * @returns {typeof PDFLib|undefined} pdf-libのグローバルオブジェクト
 */
export function getPDFLib() {
  return PDFLib;
}

/**
 * 生成済みPDFのバイト列とプレビューURLを取得する。
 * @returns {{lastPdfBytes: Uint8Array|null, lastUrl: string|null}}
 */
export function getPdfOutput() {
  return { lastPdfBytes, lastUrl };
}

/**
 * 生成したPDFを保存し、プレビューURLを更新する。
 * @param {Uint8Array} pdfBytes 生成したPDF
 * @param {Blob} blob プレビュー用PDF Blob
 * @returns {string} 新しいプレビューURL
 */
export function setPdfOutput(pdfBytes, blob) {
  // 前回生成したBlob URLがあれば解放してメモリリークを防ぐ
  if (lastUrl) URL.revokeObjectURL(lastUrl);

  // 最新のPDFデータを保存
  lastPdfBytes = pdfBytes;

  // Blobから新しいURLを生成して保持
  lastUrl = URL.createObjectURL(blob);

  // 生成したURLを返却
  return lastUrl;
}

/**
 * 生成済みPDFとプレビュー表示を初期状態に戻す。
 * @returns {void}
 */
/**
 * PDFプレビュー関連の状態を初期化する
 * - PDFデータを破棄
 * - Blob URLを解放
 * - プレビュー画面を非表示
 * - ダウンロードボタンを無効化
 */
export function resetPdfState() {
  // 保持しているPDFデータをクリア
  lastPdfBytes = null;

  // 生成済みのBlob URLを解放してメモリリークを防ぐ
  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }

  // PDFプレビューをクリアして非表示にする
  const preview = $("previewFrame");
  if (preview) {
    preview.src = "";
    preview.classList.add("is-hidden");
  }

  // 「PDFを選択してください」などのプレースホルダーを表示
  const placeholder = $("previewPlaceholder");
  if (placeholder) placeholder.style.display = "block";

  // PDFが存在しないためダウンロードを禁止
  const downloadBtn = $("dlBtn");
  if (downloadBtn) downloadBtn.disabled = true;

  // プレビュー操作バーを非表示にする
  const previewBar = $("previewBar");
  if (previewBar) previewBar.style.display = "none";
}
