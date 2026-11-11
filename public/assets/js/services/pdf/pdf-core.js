import { $ } from "../../dom.js";

/**
 * PDF生成モジュールが共有する状態、画面ヘルパー、アセット初期化を提供する。
 * pdf-libを先に読み込むこと。
 * @fileoverview PDF機能が複数スクリプト間で共有する状態とヘルパー。
 */
const PDFLib = window.PDFLib;

/** @type {Uint8Array|null} */
let templateBytes = null;
/** @type {Uint8Array|null} */
let fontBytes = null;
/** @type {{fields: Record<string, {x: number, y: number, fontSize: number}>}|null} */
let layout = null;
/** @type {Uint8Array|null} */
let lastPdfBytes = null;
/** @type {string|null} */
let lastUrl = null;

/**
 * 共通または管理画面のステータスを更新する。
 * @param {string} msg 表示するメッセージ
 * @param {boolean} [ok=false] 成功状態として表示する場合はtrue
 * @returns {void}
 */
export const setStatus = (msg, ok=false) => {
  const s = $("status") || $("admin-status");
  if (!s) return;
  s.textContent = msg;
  s.style.color = ok ? "var(--ok)" : "var(--muted)";
};

/**
 * PDF画面のエラーバナーを表示する。
 * @param {string} msg 表示するメッセージ
 * @returns {void}
 */
export function showBanner(msg) {
  const b = $("banner");
  if (!b) return;
  b.textContent = msg;
  b.style.display = "block";
}

/**
 * 指定した入力要素の前後空白を除いた値を返す。
 * @param {string} id 入力要素のID
 * @returns {string} 入力値。要素がない場合は空文字列
 */
export const v = (id) => $(id)?.value.trim() || "";

/**
 * URLからJSONまたはバイナリデータを取得する。
 * @param {string} url 取得先URL
 * @param {boolean} [asJson=false] JSONとして解析する場合はtrue
 * @returns {Promise<unknown|Uint8Array>} 取得したJSONデータまたはバイト列
 * @throws {Error} HTTPレスポンスが成功でない場合
 */
async function tryFetch(url, asJson=false) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " が読み込めません (" + res.status + ")");
  return asJson ? await res.json() : new Uint8Array(await res.arrayBuffer());
}

/**
 * PDFテンプレート、座標データ、日本語フォントを読み込み、画面状態を更新する。
 * 読み込みに失敗した場合は画面にエラーを表示する。
 * @returns {Promise<void>}
 */
export async function bootstrap() {
  if (!PDFLib) { showBanner("PDFライブラリが読み込めていません。pdf-lib.min.js の配置を確認してください。"); return; }
  try {
    layout = await tryFetch("data/positions.json", true);
    templateBytes = await tryFetch("data/template.pdf");
    fontBytes = await tryFetch("data/NotoSansJP-Regular.ttf");
    const n = Object.keys(layout.fields).length;
    if ($("assets")) $("assets").textContent = "座標:OK(" + n + ") / テンプレ:OK / フォント:OK";
    setStatus("準備完了。『PDFを生成してプレビュー』を押してください", true);
  } catch (e) {
    if ($("assets")) $("assets").textContent = "アセット読込エラー";
    showBanner("アセット読込エラー: " + e.message + " — ローカルサーバー経由で開いてください（file:// では動きません）。");
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
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastPdfBytes = pdfBytes;
  lastUrl = URL.createObjectURL(blob);
  return lastUrl;
}

/**
 * 生成済みPDFとプレビュー表示を初期状態に戻す。
 * @returns {void}
 */
export function resetPdfState() {
  lastPdfBytes = null;

  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }

  const preview = $("previewFrame");
  if (preview) {
    preview.src = "";
    preview.classList.add("is-hidden");
  }

  const placeholder = $("previewPlaceholder");
  if (placeholder) placeholder.style.display = "block";

  const downloadBtn = $("dlBtn");
  if (downloadBtn) downloadBtn.disabled = true;

  const previewBar = $("previewBar");
  if (previewBar) previewBar.style.display = "none";
}
