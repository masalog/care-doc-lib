import { $ } from "../dom.js";
import { initStorage } from "../models/storage-seed.js";
import { bootstrap } from "../services/pdf/pdf-core.js";
import "../services/pdf/pdf-export.js";

/**
 * PDF作成画面の初期化を行う。
 * @fileoverview PDF作成画面の起動と初期化。
 */
async function init() {
  const today = new Date();

  $("applyYear").value = today.getFullYear();
  $("applyMonth").value = today.getMonth() + 1;
  $("applyDay").value = today.getDate();

  await bootstrap();
  initStorage();
}

init();
