import { getDB, MEMBER_FIELDS, SETTINGS_FIELDS } from "../../models/storage-core.js";

/**
 * IndexedDBデータのJSONバックアップ、検証、復元を提供する。
 * @fileoverview バックアップ形式の検証と復元処理。
 */
const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
const BACKUP_FORMAT = "caredoc-backup";
const BACKUP_FORMAT_VERSION = 1;

/**
 * @typedef {Object} BackupData
 * @property {string} format バックアップ形式識別子
 * @property {number} formatVersion 形式バージョン
 * @property {string} [exportedAt] 書き出し日時
 * @property {Array<Record<string, string|number>>} members 利用者レコード
 * @property {Record<string, string>|null} settings 共通設定レコード
 */

/**
 * バックアップファイルのサイズが許容範囲内であることを検証する。
 * @param {number} fileSize ファイルサイズ（バイト）
 * @returns {void}
 * @throws {Error} サイズが不正または5MBを超える場合
 */
function validateBackupSize(fileSize) {
  if (!Number.isFinite(fileSize) || fileSize < 0) {
    throw new Error("バックアップファイルのサイズを確認できません。");
  }
  if (fileSize > MAX_BACKUP_SIZE) {
    throw new Error("バックアップファイルは5MB以下にしてください。");
  }
}

/**
 * JSONを解析し、形式・各フィールド・利用者IDを検証して正規化する。
 * @param {string} jsonText バックアップJSON文字
 * @param {number} fileSize ファイルサイズ（バイト）
 * @returns {BackupData} 検証済みバックアップ
 * @throws {Error} JSONまたはデータ形式が不正な場合
 */
function validateBackup(jsonText, fileSize) {
  validateBackupSize(fileSize);

  let backup;
  try {
    backup = JSON.parse(jsonText);
  } catch {
    throw new Error("JSON形式が正しくありません。");
  }

  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("バックアップの形式が正しくありません。");
  }
  if (backup.format !== BACKUP_FORMAT || backup.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error("未対応のバックアップ形式です。");
  }
  if (!Array.isArray(backup.members)) {
    throw new Error("利用者データが配列ではありません。");
  }

  const memberIds = new Set();
  const members = backup.members.map((member, index) => {
    if (!member || typeof member !== "object" || Array.isArray(member)) {
      throw new Error(`利用者データ ${index + 1} 件目の形式が正しくありません。`);
    }

    if (!Number.isInteger(member.id) || member.id <= 0) {
      throw new Error(`利用者データ ${index + 1} 件目のIDが正しくありません。`);
    }
    if (memberIds.has(member.id)) {
      throw new Error(`利用者ID ${member.id} が重複しています。`);
    }
    memberIds.add(member.id);

    const allowedKeys = new Set(["id", ...MEMBER_FIELDS]);
    const unknownKey = Object.keys(member).find((key) => !allowedKeys.has(key));
    if (unknownKey) {
      throw new Error(`利用者データに未知の項目「${unknownKey}」があります。`);
    }

    const normalized = { id: member.id };
    MEMBER_FIELDS.forEach((field) => {
      if (Object.hasOwn(member, field) && typeof member[field] !== "string") {
        throw new Error(`利用者データ ${index + 1} 件目の「${field}」は文字列である必要があります。`);
      }
      normalized[field] = member[field] ?? "";
    });

    if (!normalized.name.trim()) {
      throw new Error(`利用者データ ${index + 1} 件目の氏名が空です。`);
    }
    return normalized;
  });

  let settings = null;
  if (backup.settings !== null) {
    if (!backup.settings || typeof backup.settings !== "object" || Array.isArray(backup.settings)) {
      throw new Error("共通設定の形式が正しくありません。");
    }

    const unknownKey = Object.keys(backup.settings).find(
      (key) => !SETTINGS_FIELDS.includes(key)
    );
    if (unknownKey) {
      throw new Error(`共通設定に未知の項目「${unknownKey}」があります。`);
    }

    settings = {};
    SETTINGS_FIELDS.forEach((field) => {
      if (Object.hasOwn(backup.settings, field) && typeof backup.settings[field] !== "string") {
        throw new Error(`共通設定の「${field}」は文字列である必要があります。`);
      }
      settings[field] = backup.settings[field] ?? "";
    });
  }
列
  return {
    ...backup,
    members,
    settings,
  };
}

/**
 * バックアップ保存用のファイル名を作成する。
 * @param {boolean} [beforeRestore=false] 復元前バックアップの場合はtrue
 * @param {Date} [date=new Date()] ファイル名に使用する日時
 * @returns {string} JSONファイル名
 */
function createBackupFilename(beforeRestore = false, date = new Date()) {
  const timestamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    "_",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = beforeRestore ? "before-restore_" : "";
  return `caredoc-backup_${suffix}${timestamp}.json`;
}

/**
 * バックアップデータをJSONファイルとしてダウンロードさせる。
 * @param {BackupData} backup 書き出すバックアップデータ
 * @param {boolean} [beforeRestore=false] 復元前バックアップの場合はtrue
 * @returns {void}
 */
function downloadBackup(backup, beforeRestore = false) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = createBackupFilename(beforeRestore);
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * レコードから許可されたフィールドのみを含むバックアップ用データを作成する。
 * @param {Record<string, string|number>} record 元レコード
 * @param {string[]} fields コピーするフィールド名
 * @param {boolean} [includeId=false] 利用者IDを含める場合はtrue
 * @returns {Record<string, string|number>} バックアップ用レコード
 * @throws {Error} IDまたはフィールド値が不正な場合
 */
function createBackupRecord(record, fields, includeId = false) {
  const data = {};
  if (includeId) {
    if (!Number.isInteger(record.id) || record.id <= 0) {
      throw new Error("保存データの利用者IDが正しくありません。");
    }
    data.id = record.id;
  }
  fields.forEach((field) => {
    const value = record[field] ?? "";
    if (typeof value !== "string") {
      throw new Error(`保存データの「${field}」が文字列ではありません。`);
    }
    data[field] = value;
  });
  return data;
}

/**
 * IndexedDBから利用者と共通設定を読み出し、JSONバックアップを作成する。
 * @param {{beforeRestore?: boolean}} [options] 復元前バックアップとして作成する場合のオプション
 * @returns {Promise<BackupData>} 作成したバックアップ
 * @throws {Error} トランザクションまたはデータの処理に失敗した場合
 */
export function exportBackup({ beforeRestore = false } = {}) {
  return new Promise((resolve, reject) => {
    let transaction;
    let membersRequest;
    let settingsRequest;
    try {
      transaction = getDB().transaction(["members", "settings"], "readonly");
      membersRequest = transaction.objectStore("members").getAll();
      settingsRequest = transaction.objectStore("settings").get("singleton");
    } catch (error) {
      reject(error);
      return;
    }

    let transactionError;
    transaction.onerror = (event) => {
      transactionError = event.target?.error ?? transaction.error;
    };
    transaction.onabort = () => {
      reject(transactionError ?? new Error("バックアップ用データを読み込めませんでした。"));
    };
    transaction.oncomplete = () => {
      try {
        const settingsRecord = settingsRequest.result;
        const backup = {
          format: BACKUP_FORMAT,
          formatVersion: BACKUP_FORMAT_VERSION,
          exportedAt: new Date().toISOString(),
          app: "care-doc-lib",
          members: membersRequest.result.map((member) =>
            createBackupRecord(member, MEMBER_FIELDS, true)),
          settings: settingsRecord
            ? createBackupRecord(settingsRecord, SETTINGS_FIELDS)
            : null,
        };
        downloadBackup(backup, beforeRestore);
        resolve(backup);
      } catch (error) {
        reject(error);
      }
    };
  });
}

/**
 * 選択されたバックアップファイルをUTF-8テキストとして読み込む。
 * @param {File} file 読み込むファイル
 * @returns {Promise<string>} ファイル内容
 * @throws {Error} ファイル読み込みに失敗または中断した場合
 */
function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("バックアップファイルを読み込めませんでした。"));
    reader.onabort = () => reject(new Error("バックアップファイルの読み込みが中断されました。"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("バックアップファイルをテキストとして読み込めませんでした。"));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(file, "UTF-8");
  });
}

/**
 * 現在IndexedDBに登録されている利用者数を取得する。
 * @returns {Promise<number>} 利用者件数
 * @throws {Error} 読み込みトランザクションに失敗した場合
 */
function getCurrentMemberCount() {
  return new Promise((resolve, reject) => {
    let transaction;
    let request;
    try {
      transaction = getDB().transaction("members", "readonly");
      request = transaction.objectStore("members").count();
    } catch (error) {
      reject(error);
      return;
    }

    let transactionError;
    transaction.onerror = (event) => {
      transactionError = event.target?.error ?? transaction.error;
    };
    transaction.onabort = () =>
      reject(transactionError ?? new Error("現在の利用者数を取得できませんでした。"));
    transaction.oncomplete = () => resolve(request.result);
  });
}

/**
 * バックアップ内容で利用者・設定ストアを置き換える。
 * @param {BackupData} backup 復元する検証済みバックアップ
 * @returns {Promise<void>}
 * @throws {Error} 復元または画面データの再読み込みに失敗した場合
 */
function restoreBackupData(backup) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = getDB().transaction(["members", "settings"], "readwrite");
      const membersStore = transaction.objectStore("members");
      const settingsStore = transaction.objectStore("settings");
      membersStore.clear();
      backup.members.forEach((member) => membersStore.put(member));
      settingsStore.clear();
      if (backup.settings) {
        settingsStore.put({ ...backup.settings, id: "singleton" });
      }
    } catch (error) {
      reject(error);
      return;
    }

    let transactionError;
    transaction.onerror = (event) => {
      transactionError = event.target?.error ?? transaction.error;
    };
    transaction.onabort = () => {
      reject(transactionError ?? new Error("復元処理が中断されました。"));
    };
    transaction.oncomplete = () => resolve();
  });
}

/**
 * ファイルを検証し、確認後に現データのバックアップを作成してから復元する。
 * @param {File} file 復元するバックアップファイル
 * @param {() => Promise<unknown>} afterRestore 復元後に画面データを再読み込みする処理
 * @returns {Promise<{membersCount: number, hasSettings: boolean}|null>} 復元結果。ユーザーが確認を取り消した場合はnull
 * @throws {Error} 検証、読み込み、バックアップ、復元に失敗した場合
 */
export async function importBackup(file, afterRestore) {
  validateBackupSize(file.size);
  const backup = validateBackup(await readBackupFile(file), file.size);
  if (backup.members.length === 0) {
    throw new Error("利用者が0件のバックアップは復元できません。");
  }

  const currentMemberCount = await getCurrentMemberCount();
  const exportedDate = new Date(backup.exportedAt);
  const exportedAt = Number.isNaN(exportedDate.getTime())
    ? "不明"
    : exportedDate.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const confirmed = confirm(
    `現在のデータ（利用者 ${currentMemberCount} 件）をすべて置き換え、` +
      `バックアップ（利用者 ${backup.members.length} 件・保存日時 ${exportedAt}）を復元します。よろしいですか？`
  );
  if (!confirmed) return null;

  await exportBackup({ beforeRestore: true });
  await restoreBackupData(backup);
  await afterRestore();
  return {
    membersCount: backup.members.length,
    hasSettings: backup.settings !== null,
  };
}
