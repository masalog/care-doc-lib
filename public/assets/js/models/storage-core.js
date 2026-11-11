import { $ } from "../dom.js";

/**
 * IndexedDBのスキーマと画面項目との変換を提供する。
 * @fileoverview IndexedDBスキーマと画面項目との変換。
 */
// 利用者データ項目（人ごとに変わる）
/** @type {string[]} */
export const MEMBER_FIELDS = [
  "insuranceIdNumber","name","furigana","birthYear","birthMonth","birthDay",
  "gender","address","phone","careLevel",
  "startYear","startMonth","startDay","endYear","endMonth","endDay",
  "institutionYear","institutionMonth","institutionDay"
];
// 共通設定項目（事業所で共通）
/** @type {string[]} */
export const SETTINGS_FIELDS = [
  "surveyAddress","surveyPhone","facilityName","facilityPhone",
  "institutionName","institutionAddress","agentName","agentPostal","agentAddress","agentPhone",
  "doctorName","clinicName","clinicPostal","clinicAddress","clinicPhone"
];

/** @type {IDBDatabase|null} */
let db = null;

/**
 * アプリケーション用IndexedDBを開き、必要なオブジェクトストアを作成する。
 * @returns {Promise<IDBDatabase>} 開いたデータベース
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("caredoc", 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("members")) {
        d.createObjectStore("members", { keyPath: "id", autoIncrement: true });
      }
      if (!d.objectStoreNames.contains("settings")) {
        d.createObjectStore("settings", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 初期化済みのIndexedDB接続を返す。
 * @returns {IDBDatabase} アプリケーション用データベース
 */
export function getDB() {
  if (!db) throw new Error("データベースが初期化されていません。");
  return db;
}

/**
 * 指定したオブジェクトストアのトランザクション対象を返す。
 * @param {string|string[]} store オブジェクトストア名
 * @param {IDBTransactionMode} mode トランザクションモード
 * @returns {IDBObjectStore} オブジェクトストア
 */
export function tx(store, mode) { return getDB().transaction(store, mode).objectStore(store); }

/**
 * 指定フィールドの現在の画面値をオブジェクトとして収集する。
 * @param {string[]} fields 収集する入力要素ID
 * @returns {Record<string, string>} フィールド名と入力値の組
 */
export function collectFields(fields) {
  const o = {};
  fields.forEach(f => { o[f] = $(f).value; });
  return o;
}

/**
 * 保存済みデータの値を、同名の画面入力要素に反映する。
 * @param {Record<string, string|number>} data 画面に反映するデータ
 * @returns {void}
 */
export function applyFields(data) {
  Object.keys(data).forEach(k => { if ($(k)) $(k).value = data[k]; });
}
