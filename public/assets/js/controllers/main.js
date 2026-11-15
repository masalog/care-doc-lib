import { $ } from "../dom.js";
import { initStorage } from "../models/storage-seed.js";
import { bootstrap } from "../services/pdf/pdf-core.js";
import "../services/pdf/pdf-export.js";

/**
 * 申請日フィールドに今日の日付を設定する。
 *
 * @returns {void}
 */
function setTodayToApplyDate() {
  const today = new Date();

  $("applyYear").value = today.getFullYear();
  $("applyMonth").value = today.getMonth() + 1;
  $("applyDay").value = today.getDate();
}

 /** PDF作成画面の初期化を行う。
 *
 * 実施する処理
 * ・申請日の初期値設定
 * ・PDF機能の初期化
 * ・ストレージの初期化
 *
 * @returns {Promise<void>}
 */
async function init() {
  // 申請日の初期値を設定
  setTodayToApplyDate();

  // PDF生成機能の初期化
  await bootstrap();

  // ストレージの初期化
  initStorage();
}

// アプリケーション起動
init();
