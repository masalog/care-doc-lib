import { $ } from "../../dom.js";
import { getPdfOutput, setStatus, showBanner, v } from "./pdf-core.js";
import { generate } from "./pdf-draw.js";
import { getActiveMember } from "../../models/storage-crud.js";

/**
 * 生成済みPDFのファイル名、ダウンロード、および画面イベントを扱う。
 * @fileoverview 生成済みPDFのファイル名、ダウンロード、および画面イベント。
 */
/**
 * 現在の日付と利用者名から出力ファイル名を作成する。
 * @returns {string} PDFファイル名
 */
function buildFileName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateStr = `${y}年${Number(m)}月${Number(d)}日`;
  // 氏名の前後空白を除去し、名前中の空白は詰める。入力があれば「様」を付ける（未入力なら「無名」）
  const raw = String(getActiveMember()?.name || v("name")).replace(/\s+/g, "");
  const name = raw ? raw + "様" : "無名";
  return `${dateStr}_${name}_介護認定申請書.pdf`;
}

/**
 * 生成済みPDFをダウンロードする。
 * PDFがまだ生成されていない場合は何もしない。
 * @returns {void}
 */
function download() {
  const { lastPdfBytes } = getPdfOutput();
  if (!lastPdfBytes) return;
  const blob = new Blob([lastPdfBytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = buildFileName();
  a.click();
}

if ($("genBtn")) {
  $("genBtn").addEventListener("click", () => generate().catch(e => {
    console.error(e);
    setStatus("エラー: " + e.message);
    showBanner("PDF生成エラー: " + e.message);
  }));
}
if ($("dlBtn")) $("dlBtn").addEventListener("click", download);
if ($("openTabBtn")) $("openTabBtn").addEventListener("click", () => {
  const { lastUrl } = getPdfOutput();
  if (lastUrl) window.open(lastUrl, "_blank");
});
