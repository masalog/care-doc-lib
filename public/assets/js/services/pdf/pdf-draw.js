import { $ } from "../../dom.js";
import {
  getPDFLib,
  getPdfAssets,
  resetPdfState,
  setPdfOutput,
  setStatus,
} from "./pdf-core.js";
import {
  areSettingsLoaded,
  getActiveMember,
  getActiveSettings,
  getMemberGeneration,
} from "../../models/storage-crud.js";

/**
 * 申請書テンプレートへの値の描画とPDF生成を行う。
 * @fileoverview PDFテンプレートへの値の描画とPDF生成。
 */
/**
 * 座標レイアウトに従って文字列をPDFページに描画する。
 * @param {PDFPage} page 描画先ページ
 * @param {PDFFont} font 埋め込み済みフォント
 * @param {string} key 座標データのフィールド名
 * @param {string|number|null|undefined} value 描画する値
 * @returns {void}
 */
function drawText(page, font, key, value) {
  if (value == null || value === "") return;
  const pos = getPdfAssets().layout.fields[key];
  if (!pos) return;
  const { rgb } = getPDFLib();
  String(value).split("\n").forEach((line, i) => {
    if (line === "") return;
    page.drawText(line, { x: pos.x, y: pos.y - i * (pos.fontSize + 2), size: pos.fontSize, font, color: rgb(0,0,0) });
  });
}

/**
 * 指定した座標に選択マークを描画する。
 * @param {PDFPage} page 描画先ページ
 * @param {PDFFont} font 埋め込み済みフォント
 * @param {string} key 座標データのフィールド名
 * @returns {void}
 */
function drawCircle(page, font, key) {
  const pos = getPdfAssets().layout.fields[key];
  if (!pos) return;
  page.drawText("〇", { x: pos.x, y: pos.y, size: pos.fontSize, font });
}

/**
 * 介護度を座標データ上の英語フィールド名に変換する。
 * @param {string} c 日本語の介護度
 * @returns {string|null} 対応する座標フィールド名。該当しない場合はnull
 */
function mapCareLevel(c) {
  return ({ "要介護1":"Long-term Care Level 1","要介護2":"Long-term Care Level 2","要介護3":"Long-term Care Level 3",
    "要介護4":"Long-term Care Level 4","要介護5":"Long-term Care Level 5","要支援1":"Support Level 1","要支援2":"Support Level 2" })[c] || null;
}

/**
 * 画面入力、選択中の利用者、共通設定からPDF用の値を取得する。
 * @param {string} id PDF座標またはデータ項目の識別子
 * @returns {string} PDFに使用する値
 */
function pdfValue(id) {
  const fieldId = id === "Insurance ID Number" ? "insuranceIdNumber" : id;
  const input = $(fieldId);
  if (input) return input.value.trim();
  const activeMember = getActiveMember();
  const activeSettings = getActiveSettings();
  if (Object.prototype.hasOwnProperty.call(activeMember || {}, fieldId)) {
    return String(activeMember[fieldId] ?? "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(activeSettings || {}, fieldId)) {
    return String(activeSettings[fieldId] ?? "").trim();
  }
  return "";
}

/**
 * 年月日が実在する日付か検証する。
 * @param {string|number} year 年
 * @param {string|number} month 月（1始まり）
 * @param {string|number} day 日
 * @returns {boolean} 有効な日付の場合はtrue
 */
function isValidApplyDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return false;
  }

  const maxDay = new Date(y, m, 0).getDate();

  return Number.isInteger(d) && d >= 1 && d <= maxDay;
}

/**
 * 現在選択されている利用者と入力値から申請書PDFを生成し、画面にプレビューする。
 * @returns {Promise<void>}
 */
export async function generate() {
  const generationAtStart = getMemberGeneration();
  const { layout, templateBytes, fontBytes } = getPdfAssets();
  const PDFLib = getPDFLib();

  if (!layout || !templateBytes || !fontBytes) {
    setStatus("アセット未読込のため生成できません");
    return;
  }

  if (!areSettingsLoaded()) {
    setStatus("共通設定を読み込み中です。");
    return;
  }

  if (!getActiveMember()) {
    setStatus("利用者を選択してください");
    return;
  }

  // 申請日チェック
  if (
    !isValidApplyDate(
      $("applyYear").value,
      $("applyMonth").value,
      $("applyDay").value
    )
  ) {
    // 前回生成したPDFを破棄
    resetPdfState();

    setStatus("申請日が正しくありません");
    return;
  }

  setStatus("生成中…");

  const pdfDoc = await PDFLib.PDFDocument.load(templateBytes.slice(0));
  pdfDoc.registerFontkit(window.fontkit);

  const font = await pdfDoc.embedFont(fontBytes, {
    subset: false,
  });

  const page = pdfDoc.getPages()[0];

  drawText(page, font, "Insurance ID Number", pdfValue("Insurance ID Number"));
  drawText(page, font, "name", pdfValue("name"));
  drawText(page, font, "furigana", pdfValue("furigana"));
  drawText(page, font, "birthYear", pdfValue("birthYear"));
  drawText(page, font, "birthMonth", pdfValue("birthMonth"));
  drawText(page, font, "birthDay", pdfValue("birthDay"));
  drawText(page, font, "address", pdfValue("address"));
  drawText(page, font, "phone", pdfValue("phone"));

  if (pdfValue("gender") === "男") {
    drawCircle(page, font, "genderMale");
  } else if (pdfValue("gender") === "女") {
    drawCircle(page, font, "genderFemale");
  }

  const careKey = mapCareLevel(pdfValue("careLevel"));
  if (careKey) drawCircle(page, font, careKey);

  drawText(page, font, "startYear", pdfValue("startYear"));
  drawText(page, font, "startMonth", pdfValue("startMonth"));
  drawText(page, font, "startDay", pdfValue("startDay"));

  drawText(page, font, "endYear", pdfValue("endYear"));
  drawText(page, font, "endMonth", pdfValue("endMonth"));
  drawText(page, font, "endDay", pdfValue("endDay"));

  drawText(page, font, "institutionYear", pdfValue("institutionYear"));
  drawText(page, font, "institutionMonth", pdfValue("institutionMonth"));
  drawText(page, font, "institutionDay", pdfValue("institutionDay"));

  drawText(page, font, "Survey Location Address", pdfValue("surveyAddress"));
  drawText(page, font, "Survey Location Phone", pdfValue("surveyPhone"));

  drawText(page, font, "facilityName", pdfValue("facilityName"));
  drawText(page, font, "facilityPhone", pdfValue("facilityPhone"));

  drawText(page, font, "institutionName", pdfValue("institutionName"));
  drawText(page, font, "institutionAddress", pdfValue("institutionAddress"));

  drawText(page, font, "agentName", pdfValue("agentName"));
  drawText(page, font, "agentPostal", pdfValue("agentPostal"));
  drawText(page, font, "agentAddress", pdfValue("agentAddress"));
  drawText(page, font, "agentPhone", pdfValue("agentPhone"));

  drawText(page, font, "doctorName", pdfValue("doctorName"));
  drawText(page, font, "clinicName", pdfValue("clinicName"));
  drawText(page, font, "clinicPostal", pdfValue("clinicPostal"));
  drawText(page, font, "clinicAddress", pdfValue("clinicAddress"));
  drawText(page, font, "clinicPhone", pdfValue("clinicPhone"));

  drawCircle(page, font, "isFacility");
  drawCircle(page, font, "agentCategory");

  drawText(page, font, "applyYear", pdfValue("applyYear"));
  drawText(page, font, "applyMonth", pdfValue("applyMonth"));
  drawText(page, font, "applyDay", pdfValue("applyDay"));

drawText(page, font, "Change Request Reason", pdfValue("changeReason"));

const pdfBytes = await pdfDoc.save();

// 利用者切替が発生した場合は生成結果を破棄
if (generationAtStart !== getMemberGeneration()) {
  return;
}

const blob = new Blob([pdfBytes], {
  type: "application/pdf",
});

const lastUrl = setPdfOutput(pdfBytes, blob);

  const ph = $("previewPlaceholder");
  if (ph) ph.style.display = "none";

  $("previewFrame").classList.remove("is-hidden");
  $("previewFrame").src = lastUrl;

  $("previewBar").style.display = "block";
  $("dlBtn").disabled = false;

  setStatus(
    "生成しました（データは外部送信していません）",
    true
  );
}