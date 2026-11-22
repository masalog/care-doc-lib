import { $ } from "../../dom.js";
import { getPdfOutput, setStatus, showBanner, getFormValue } from "./pdf-core.js";
import { generate } from "./pdf-draw.js";
import { getActiveMember } from "../../models/storage-crud.js";

/**
 * 生成済みPDFのファイル名作成、ダウンロード、および画面イベントを担当する。
 * @fileoverview PDF出力関連のUIイベント処理。
 */

/**
 * 現在日付と利用者名からPDFファイル名を生成する。
 *
 * 生成例:
 *   2026年11月22日_山田太郎様_介護認定申請書.pdf
 *
 * 利用者名は保存済み会員情報を優先し、
 * 未取得の場合はフォーム入力値を使用する。
 *
 * @returns {string} PDFダウンロード時のファイル名
 */
function buildFileName() {
  // 現在日時を取得
  const now = new Date();

  // 年月日を取り出し
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");

  // 「2026年11月22日」形式へ変換
  const dateStr = `${y}年${Number(m)}月${Number(d)}日`;

  // 保存済み会員名を優先的に取得
  // 存在しない場合はフォーム入力値を利用
  const raw = String(
    getActiveMember()?.name || getFormValue("name")
  ).replace(/\s+/g, "");

  // 空白を除去した氏名に「様」を付与
  // 未入力時は「無名」を使用
  const name = raw ? raw + "様" : "無名";

  // 最終的なPDFファイル名
  return `${dateStr}_${name}_介護認定申請書.pdf`;
}

/**
 * 生成済みPDFをダウンロードする。
 *
 * getPdfOutput() に保持されているPDFバイト列を
 * Blobへ変換し、ダウンロードリンクを動的生成して保存する。
 *
 * @returns {void}
 */
function download() {
  const { lastPdfBytes } = getPdfOutput();

  // PDF未生成の場合は何もしない
  if (!lastPdfBytes) return;

  const fileName = buildFileName();

  // PDFデータをBlob化
  const blob = new Blob([lastPdfBytes], {
    type: "application/pdf",
  });

  // 一時的なダウンロードリンクを生成
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  // ダウンロードファイル名を設定
  a.download = fileName;

  // 自動クリックで保存を開始
  a.click();

  // 利用者へ通知
  showBanner(`PDFをダウンロードしました: ${fileName}`);
}

// PDFダウンロードボタンにクリックイベントを登録
if ($("dlBtn")) {
  $("dlBtn").addEventListener("click", download);
}

/**
 * PDF生成ボタン押下時の処理。
 * PDF生成を実行し、失敗時はエラー内容を表示する。
 *
 * @async
 * @returns {Promise<void>}
 */
async function onGenerateClick() {
  try {
    await generate();
  } catch (error) {
    console.error(error);
    setStatus("エラー: " + error.message);
    showBanner("PDF生成エラー: " + error.message);
  }
}

// PDF生成ボタンにクリックイベントを登録
if ($("genBtn")) {
  $("genBtn").addEventListener("click", onGenerateClick);
}

/**
 * 生成済みPDFを新しいタブで表示する。
 * PDFが未生成の場合は何もしない。
 */
function openPdfInNewTab() {
  const { lastUrl } = getPdfOutput();

  // PDFの表示URLが存在する場合のみ開く
  if (lastUrl) {
    window.open(lastUrl, "_blank");
  }
}

// PDF表示ボタン
if ($("openTabBtn")) {
  $("openTabBtn").addEventListener("click", openPdfInNewTab);
}