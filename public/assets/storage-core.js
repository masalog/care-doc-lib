// ===================== データ保存: フィールド定義・DB基盤 =====================
// 依存: pdf-core.js（$ を共有）。読み込み順は pdf-core.js の後にすること。
// 利用者データ項目（人ごとに変わる）
const MEMBER_FIELDS = [
  "insuranceIdNumber","name","furigana","birthYear","birthMonth","birthDay",
  "gender","address","phone","careLevel",
  "startYear","startMonth","startDay","endYear","endMonth","endDay",
  "institutionYear","institutionMonth","institutionDay"
];
// 共通設定項目（事業所で共通）
const SETTINGS_FIELDS = [
  "surveyAddress","surveyPhone","facilityName","facilityPhone",
  "institutionName","institutionAddress","agentName","agentPostal","agentAddress","agentPhone",
  "doctorName","clinicName","clinicPostal","clinicAddress","clinicPhone"
];

let db = null;

function openDB() {
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) { return db.transaction(store, mode).objectStore(store); }

function collectFields(fields) {
  const o = {};
  fields.forEach(f => { o[f] = $(f).value; });
  return o;
}
function applyFields(data) {
  Object.keys(data).forEach(k => { if ($(k)) $(k).value = data[k]; });
}
