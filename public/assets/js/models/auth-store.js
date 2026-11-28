import { getDB } from "./storage-core.js";

/**
 * IndexedDBのaccountsストアに対する永続化操作を提供する。
 * @fileoverview アカウント情報のIndexedDBアクセス層。
 */

/**
 * @typedef {Object} AccountRecord
 * @property {string} accountId ログインID（主キー）
 * @property {string} displayName 表示名
 * @property {"staff"} role ロール（1ロール固定）
 * @property {string} passwordHash Base64エンコード済みハッシュ
 * @property {string} passwordSalt Base64エンコード済みソルト
 * @property {string} hashAlgorithm ハッシュアルゴリズム識別子
 * @property {number} hashIterations 反復回数
 * @property {number} failedCount 連続失敗回数
 * @property {string|null} lockedUntil 一時ロック解除日時（ISO 8601）
 * @property {string} createdAt 作成日時
 * @property {string} updatedAt 更新日時
 */

/**
 * アカウントIDを格納用キーへ正規化する。
 * @param {string} accountId アカウントID
 * @returns {string} 正規化済みID
 */
function normalizeKey(accountId) {
  return typeof accountId === "string" ? accountId.trim().toLowerCase() : "";
}

/**
 * 登録済みアカウント件数を取得する。
 * @returns {Promise<number>} アカウント件数
 */
export function countAccounts() {
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readonly");
    const req = transaction.objectStore("accounts").count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("アカウント件数を取得できませんでした。"));
  });
}

/**
 * 全アカウントを作成日時順で取得する。
 * @returns {Promise<AccountRecord[]>} アカウント一覧
 */
export function listAccounts() {
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readonly");
    const req = transaction.objectStore("accounts").getAll();
    req.onsuccess = () => {
      const items = [...req.result].sort((a, b) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
      );
      resolve(items);
    };
    req.onerror = () => reject(req.error ?? new Error("アカウント一覧を取得できませんでした。"));
  });
}

/**
 * 指定したIDのアカウントを取得する。
 * @param {string} accountId アカウントID
 * @returns {Promise<AccountRecord|null>} 見つかったアカウント、存在しない場合はnull
 */
export function getAccount(accountId) {
  const key = normalizeKey(accountId);
  if (!key) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readonly");
    const req = transaction.objectStore("accounts").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("アカウント情報を取得できませんでした。"));
  });
}

/**
 * 新規アカウントを1件登録する（重複IDはエラー）。
 * @param {AccountRecord} record 登録するアカウントレコード
 * @returns {Promise<AccountRecord>} 登録されたアカウント
 */
export function insertAccount(record) {
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readwrite");
    const store = transaction.objectStore("accounts");
    const req = store.add(record);
    req.onerror = () => {
      if (req.error?.name === "ConstraintError") {
        reject(new Error(`アカウントID「${record.accountId}」はすでに登録されています。`));
        return;
      }
      reject(req.error ?? new Error("アカウントを作成できませんでした。"));
    };
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => {
      if (transaction.error?.name === "ConstraintError") {
        reject(new Error(`アカウントID「${record.accountId}」はすでに登録されています。`));
        return;
      }
      reject(transaction.error ?? new Error("アカウント作成処理が中断されました。"));
    };
  });
}

/**
 * 既存アカウントを更新する。
 * @param {AccountRecord} record 更新するアカウントレコード
 * @returns {Promise<AccountRecord>} 更新後のレコード
 */
export function putAccount(record) {
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readwrite");
    const store = transaction.objectStore("accounts");

    let rejectionError = null;

    const getReq = store.get(record.accountId);

    getReq.onsuccess = () => {
      if (!getReq.result) {
        rejectionError = new Error("対象のアカウントが見つかりません。");
        transaction.abort();
        return;
      }

      store.put(record);
    };

    getReq.onerror = () => {
      rejectionError =
        getReq.error ?? new Error("アカウント情報を確認できませんでした。");
      transaction.abort();
    };

    transaction.onerror = () => {
      if (!rejectionError) {
        rejectionError =
          transaction.error ?? new Error("アカウントを更新できませんでした。");
      }
    };

    transaction.onabort = () => {
      reject(
        rejectionError ??
          transaction.error ??
          new Error("アカウント更新処理が中断されました。")
      );
    };

    transaction.oncomplete = () => resolve(record);
  });
}

/**
 * 指定したアカウントIDのレコードをトランザクション内で削除する。
 * @param {string} accountId 削除対象のアカウントID
 * @returns {Promise<AccountRecord>} 削除されたアカウントレコード
 */
export function deleteAccountById(accountId) {
  const key = normalizeKey(accountId);
  return new Promise((resolve, reject) => {
    const transaction = getDB().transaction("accounts", "readwrite");
    const store = transaction.objectStore("accounts");
    const getReq = store.get(key);
    let target = null;
    let rejectionError = null;

    getReq.onsuccess = () => {
      target = getReq.result ?? null;
      if (!target) {
        rejectionError = new Error("対象のアカウントが見つかりません。");
        transaction.abort();
        return;
      }
      store.delete(target.accountId);
    };

    getReq.onerror = () => {
      rejectionError = getReq.error ?? new Error("アカウント情報を確認できませんでした。");
    };
    transaction.onerror = () => {
      if (!rejectionError) {
        rejectionError = transaction.error ?? new Error("アカウントを削除できませんでした。");
      }
    };
    transaction.onabort = () => {
      reject(rejectionError ?? transaction.error ?? new Error("アカウント削除が中断されました。"));
    };
    transaction.oncomplete = () => resolve(target);
  });
}
