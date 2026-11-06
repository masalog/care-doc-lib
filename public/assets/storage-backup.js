const MAX_BACKUP_SIZE = 5 * 1024 * 1024;
const BACKUP_FORMAT = "caredoc-backup";
const BACKUP_FORMAT_VERSION = 1;

function validateBackupSize(fileSize) {
  if (!Number.isFinite(fileSize) || fileSize < 0) {
    throw new Error("バックアップファイルのサイズを確認できません。");
  }
  if (fileSize > MAX_BACKUP_SIZE) {
    throw new Error("バックアップファイルは5MB以下にしてください。");
  }
}

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

  return {
    ...backup,
    members,
    settings,
  };
}

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

function exportBackup({ beforeRestore = false } = {}) {
  return new Promise((resolve, reject) => {
    let transaction;
    let membersRequest;
    let settingsRequest;
    try {
      transaction = db.transaction(["members", "settings"], "readonly");
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

function getCurrentMemberCount() {
  return new Promise((resolve, reject) => {
    let transaction;
    let request;
    try {
      transaction = db.transaction("members", "readonly");
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

function restoreBackupData(backup) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(["members", "settings"], "readwrite");
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
    transaction.oncomplete = async () => {
      try {
        await Promise.all([refreshMembers(), loadAdminSettings()]);
        resolve();
      } catch (error) {
        reject(error);
      }
    };
  });
}

async function importBackup(file) {
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
  return {
    membersCount: backup.members.length,
    hasSettings: backup.settings !== null,
  };
}
