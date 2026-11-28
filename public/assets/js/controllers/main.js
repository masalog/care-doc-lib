import { $ } from "../dom.js";
import { initStorage } from "../models/storage-seed.js";
import { bootstrap } from "../services/pdf/pdf-core.js";
import "../services/pdf/pdf-export.js";
import { initAuthGate } from "./auth-ui.js";

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

/**
 * PDF作成画面の初期化を行う。
 *
 * 実施する処理
 * ・申請日の初期値設定
 * ・PDFアセットの初期化
 * ・認証確認および認証後のストレージ初期化
 *
 * @returns {Promise<void>}
 */
async function init() {
  // 申請日の初期値を設定
  setTodayToApplyDate();

  // PDFアセット読込は認証UIの表示をブロックしないよう並行開始する
  const bootstrapPromise = bootstrap();

  // 認証UIを即座に表示し、認証完了後に利用者データを読み込む
  await initAuthGate({
    onAuthenticated: async () => {
      await bootstrapPromise;
      await initStorage();
    },
  });
}

// アプリケーション起動
init();
