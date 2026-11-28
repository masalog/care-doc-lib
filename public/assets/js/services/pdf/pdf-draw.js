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
import { requireActiveSession } from "../auth/auth-service.js";

/**
 * 申請書テンプレートへの値の描画とPDF生成を行う。
 * @fileoverview PDFテンプレートへの値の描画とPDF生成。
 */
/**
 * PDF上の指定されたフィールド位置にテキストを描画する
 * @param {PDFPage} page - 描画対象のPDFページ
 * @param {PDFFont} font - 使用するフォント
 * @param {string} key - レイアウト定義のフィールドキー
 * @param {string|number|null|undefined} value - 描画する値
 * @returns {void}
 */
function drawText(page, font, key, value) {
  // 値が未設定または空文字の場合は何もしない
  if (value == null || value === "") return;

  // フィールドキーに対応する描画位置情報を取得
  const pos = getPdfAssets().layout.fields[key];

  // レイアウト定義が存在しない場合は何もしない
  if (!pos) return;

  // PDF-Lib の rgb() 関数を取り出して、色を指定しやすくしている
  const pdfLib = getPDFLib();
  const rgb = pdfLib.rgb;

  // valueを文字列として扱い、改行コード("\n")で分割して配列化する
  // 例: "あいう\nえお" → ["あいう", "えお"]
  var lines = String(value).split("\n");

  // 分割した各行を順番に処理する
  for (var i = 0; i < lines.length; i++) {

    // 現在処理中の行の文字列を取得
    var line = lines[i];

    // 空行（何も文字がない行）は描画する必要がないためスキップ
    if (line === "") {
      continue;
    }

    // PDF上に文字列を描画する
    page.drawText(line, {

      // 文字の描画開始位置（X座標）
      // レイアウト定義で指定された位置をそのまま使用
      x: pos.x,

      // 文字の描画開始位置（Y座標）
      // 1行目は pos.y
      // 2行目は pos.y - (フォントサイズ+2)
      // 3行目は pos.y - 2×(フォントサイズ+2)
      // のように1行ごとに下方向へずらす
      y: pos.y - i * (pos.fontSize + 2),

      // フォントサイズ
      size: pos.fontSize,

      // 使用するフォント
      font: font,

      // 文字色（RGB形式）
      // rgb(0,0,0) は黒色
      color: rgb(0, 0, 0)
    });
  }
}

/**
 * PDF上の指定された位置に「〇」を描画する
 *
 * @param {PDFPage} page - 描画対象のPDFページ
 * @param {PDFFont} font - 使用するフォント
 * @param {string} key - レイアウト定義のフィールドキー
 * @returns {void}
 */
function drawCircle(page, font, key) {

  // フィールドキーに対応する描画位置情報を取得する
  // 例:
  // {
  //   x: 100,
  //   y: 500,
  //   fontSize: 12
  // }
  const pos = getPdfAssets().layout.fields[key];

  // 指定されたキーのレイアウト定義が存在しない場合は何もしない
  if (!pos) return;

  // 指定された座標に「〇」を描画する
  page.drawText("〇", {

    // X座標（横位置）
    x: pos.x,

    // Y座標（縦位置）
    y: pos.y,

    // 文字サイズ
    size: pos.fontSize,

    // 使用するフォント
    font: font
  });
}

/**
 * 要介護・要支援区分を英語表記へ変換する
 *
 * @param {string} careLevel - 要介護区分（例: "要介護3"）
 * @returns {string|null} 英語表記。対応する値がない場合は null
 */
function mapCareLevel(careLevel) {
  const careLevelMap = {
    "要介護1": "Long-term Care Level 1",
    "要介護2": "Long-term Care Level 2",
    "要介護3": "Long-term Care Level 3",
    "要介護4": "Long-term Care Level 4",
    "要介護5": "Long-term Care Level 5",
    "要支援1": "Support Level 1",
    "要支援2": "Support Level 2"
  };

  // 対応する英語表記を取得する
  return careLevelMap[careLevel] || null;
}

/**
 * PDF出力用の値を取得する
 *
 * 取得順序:
 * 1. 画面上の入力項目
 * 2. activeMember
 * 3. activeSettings
 * 4. 見つからなければ空文字
 *
 * @param {string} id - PDFフィールドID
 * @returns {string} PDFに出力する値
 */
function pdfValue(id) {

  // PDFフィールド名と画面項目名が異なるものを変換
  const fieldId =
    id === "Insurance ID Number"
      ? "insuranceIdNumber"
      : id;

  // 画面入力値を優先して取得
  const input = $(fieldId);
  if (input) {
    return input.value.trim();
  }

  // 利用者情報から取得
  const activeMember = getActiveMember();
  if (activeMember && fieldId in activeMember) {
    return String(activeMember[fieldId] ?? "").trim();
  }

  // 設定情報から取得
  const activeSettings = getActiveSettings();
  if (activeSettings && fieldId in activeSettings) {
    return String(activeSettings[fieldId] ?? "").trim();
  }

  // 値が見つからない場合
  return "";
}

/**
 * 適用開始日の妥当性をチェックする
 *
 * @param {string|number} year  - 年
 * @param {string|number} month - 月
 * @param {string|number} day   - 日
 * @returns {boolean}
 *   true  : 有効な日付
 *   false : 無効な日付
 */
function isValidApplyDate(year, month, day) {

  // 入力値を数値へ変換する
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  // 月が 1～12 の範囲外なら不正
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return false;
  }

  // 指定された年月の最終日を取得する
  // 例:
  // new Date(2024, 2, 0) → 2024/02/29
  // new Date(2025, 2, 0) → 2025/02/28
  const maxDay = new Date(y, m, 0).getDate();

  // 日が 1～月末日の範囲内なら有効
  return Number.isInteger(d) &&
         d >= 1 &&
         d <= maxDay;
}

/**
 * 要介護認定申請書PDFを生成し、プレビュー画面へ表示する。
 *
 * 現在選択中の利用者情報と入力内容をPDFテンプレートへ転記し、
 * ブラウザ上で閲覧可能なPDFを作成する。
 *
 * @returns {Promise<void>}
 */
export async function generate() {

  // 生成開始時点の利用者世代を保持する
  // PDF生成中に利用者が切り替わった場合の検知に利用する
  const generationAtStart = getMemberGeneration();

  await requireActiveSession();

  // 認証待機中に利用者が切り替わっていたら中断
  if (generationAtStart !== getMemberGeneration()) {
    setStatus("利用者が切り替わったためPDF生成を中断しました。");
    return;
  }

  // PDFテンプレート・レイアウト情報・フォントを取得
  const { layout, templateBytes, fontBytes } = getPdfAssets();

  // PDF-Libを取得
  const PDFLib = getPDFLib();

  // 必要なアセットが読み込まれていない場合は中断
  if (!layout || !templateBytes || !fontBytes) {
    setStatus("アセット未読込のため生成できません");
    return;
  }

  // 共通設定の読み込み完了を確認
  if (!areSettingsLoaded()) {
    setStatus("共通設定を読み込み中です。");
    return;
  }

  // 利用者が選択されているか確認
  if (!getActiveMember()) {
    setStatus("利用者を選択してください");
    return;
  }

  // ==========================================================
  // 申請日の入力チェック
  // ==========================================================

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

  // 画面へ処理中メッセージを表示
  setStatus("生成中…");

  // ==========================================================
  // PDFテンプレートを読み込む
  // ==========================================================

  const pdfDoc = await PDFLib.PDFDocument.load(templateBytes.slice(0));

  // カスタムフォントを利用できるよう登録
  pdfDoc.registerFontkit(window.fontkit);

  // PDFへフォントを埋め込む
  const font = await pdfDoc.embedFont(fontBytes, {
    subset: false,
  });

  // テンプレートの1ページ目を取得
  const page = pdfDoc.getPages()[0];

  // ==========================================================
  // 基本情報を出力
  // ==========================================================

  drawText(page, font, "Insurance ID Number", pdfValue("Insurance ID Number"));
  drawText(page, font, "name", pdfValue("name"));
  drawText(page, font, "furigana", pdfValue("furigana"));
  drawText(page, font, "birthYear", pdfValue("birthYear"));
  drawText(page, font, "birthMonth", pdfValue("birthMonth"));
  drawText(page, font, "birthDay", pdfValue("birthDay"));
  drawText(page, font, "address", pdfValue("address"));
  drawText(page, font, "phone", pdfValue("phone"));

  // ==========================================================
  // 性別の選択欄へ〇を付ける
  // ==========================================================

  if (pdfValue("gender") === "男") {
    drawCircle(page, font, "genderMale");
  } else if (pdfValue("gender") === "女") {
    drawCircle(page, font, "genderFemale");
  }

  // ==========================================================
  // 要介護度の選択欄へ〇を付ける
  // ==========================================================

  const careKey = mapCareLevel(pdfValue("careLevel"));

  if (careKey) {
    drawCircle(page, font, careKey);
  }

  // ==========================================================
  // 認定有効期間
  // ==========================================================

  drawText(page, font, "startYear", pdfValue("startYear"));
  drawText(page, font, "startMonth", pdfValue("startMonth"));
  drawText(page, font, "startDay", pdfValue("startDay"));

  drawText(page, font, "endYear", pdfValue("endYear"));
  drawText(page, font, "endMonth", pdfValue("endMonth"));
  drawText(page, font, "endDay", pdfValue("endDay"));

  // ==========================================================
  // 入所・入院日
  // ==========================================================

  drawText(page, font, "institutionYear", pdfValue("institutionYear"));
  drawText(page, font, "institutionMonth", pdfValue("institutionMonth"));
  drawText(page, font, "institutionDay", pdfValue("institutionDay"));

  // ==========================================================
  // 認定調査場所
  // ==========================================================

  drawText(page, font, "Survey Location Address", pdfValue("surveyAddress"));
  drawText(page, font, "Survey Location Phone", pdfValue("surveyPhone"));

  // ==========================================================
  // 施設情報
  // ==========================================================

  drawText(page, font, "facilityName", pdfValue("facilityName"));
  drawText(page, font, "facilityPhone", pdfValue("facilityPhone"));

  drawText(page, font, "institutionName", pdfValue("institutionName"));
  drawText(page, font, "institutionAddress", pdfValue("institutionAddress"));

  // ==========================================================
  // 代理人情報
  // ==========================================================

  drawText(page, font, "agentName", pdfValue("agentName"));
  drawText(page, font, "agentPostal", pdfValue("agentPostal"));
  drawText(page, font, "agentAddress", pdfValue("agentAddress"));
  drawText(page, font, "agentPhone", pdfValue("agentPhone"));

  // ==========================================================
  // 主治医情報
  // ==========================================================

  drawText(page, font, "doctorName", pdfValue("doctorName"));
  drawText(page, font, "clinicName", pdfValue("clinicName"));
  drawText(page, font, "clinicPostal", pdfValue("clinicPostal"));
  drawText(page, font, "clinicAddress", pdfValue("clinicAddress"));
  drawText(page, font, "clinicPhone", pdfValue("clinicPhone"));

  // ==========================================================
  // 固定で〇を付ける項目
  // ==========================================================

  drawCircle(page, font, "isFacility");
  drawCircle(page, font, "agentCategory");

  // ==========================================================
  // 申請日
  // ==========================================================

  drawText(page, font, "applyYear", pdfValue("applyYear"));
  drawText(page, font, "applyMonth", pdfValue("applyMonth"));
  drawText(page, font, "applyDay", pdfValue("applyDay"));

  // ==========================================================
  // 変更申請理由
  // ==========================================================

  drawText(page, font, "Change Request Reason", pdfValue("changeReason"));

  // ==========================================================
  // PDFを保存
  // ==========================================================

  const pdfBytes = await pdfDoc.save();

  // PDF生成中に利用者が切り替わった場合は結果を破棄する
  if (generationAtStart !== getMemberGeneration()) {
    return;
  }

  // PDFバイトデータからブラウザ表示用のBlobを生成する
  const blob = new Blob([pdfBytes], {
    type: "application/pdf",
  });

  // PDFデータを保存し、プレビュー表示用URLを取得する
  const lastUrl = setPdfOutput(pdfBytes, blob);

  // ==========================================================
  // プレビュー表示
  // ==========================================================

  // プレースホルダーを非表示にする
  const ph = $("previewPlaceholder");
  if (ph) {
    ph.style.display = "none";
  }

  // 生成したPDFをプレビュー表示する
  $("previewFrame").classList.remove("is-hidden");
  $("previewFrame").src = lastUrl;

  // 操作バーを表示し、ダウンロードを可能にする
  $("previewBar").style.display = "block";
  $("dlBtn").disabled = false;

  // 完了メッセージを表示する
  setStatus(
    "介護認定申請書を作成しました" + "\n" + 
    "（こちらでよろしければ、ダウンロードボタンを押してください）",
    true
  );
}