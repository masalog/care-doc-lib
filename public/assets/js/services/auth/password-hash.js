/**
 * Web Crypto APIを用いたPINハッシュ生成・検証およびアカウント入力検証を提供する。
 * @fileoverview PINハッシュ導出とアカウント項目の検証。
 */

export const HASH_ALGORITHM = "PBKDF2-SHA256";
export const PBKDF2_ITERATIONS = 100000;
export const SALT_BYTE_LENGTH = 16;
export const DERIVED_KEY_BITS = 256;

const ACCOUNT_ID_PATTERN = /^[a-z0-9_-]{2,32}$/;
const PIN_PATTERN = /^\d{4}$/;
const REPEATED_PIN_PATTERN = /^(\d)\1{3}$/;

/**
 * バイト配列をBase64文字列へ変換する。
 * @param {Uint8Array} bytes 変換するバイト列
 * @returns {string} Base64文字列
 */
export function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64文字列をバイト配列へ変換する。
 * @param {string} base64 Base64文字列
 * @returns {Uint8Array} 復元したバイト列
 */
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 2つのバイト列を定数時間で比較する。
 * @param {Uint8Array} left 比較対象1
 * @param {Uint8Array} right 比較対象2
 * @returns {boolean} 一致する場合はtrue
 */
export function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array)) {
    return false;
  }
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

/**
 * アカウントIDを正規化し、形式を検証する。
 * @param {string} rawAccountId 入力されたアカウントID
 * @returns {string} 正規化済みアカウントID（小文字・前後空白除去）
 * @throws {Error} 形式が不正な場合
 */
export function normalizeAndValidateAccountId(rawAccountId) {
  const normalized = typeof rawAccountId === "string" ? rawAccountId.trim().toLowerCase() : "";
  if (!ACCOUNT_ID_PATTERN.test(normalized)) {
    throw new Error("アカウントIDは2〜32文字の半角英数字・ハイフン・アンダースコアで入力してください。");
  }
  return normalized;
}

/**
 * 表示名を正規化し、必須チェックを行う。
 * @param {string} rawDisplayName 入力された表示名
 * @returns {string} 前後空白を除去した表示名
 * @throws {Error} 空または長すぎる場合
 */
export function normalizeAndValidateDisplayName(rawDisplayName) {
  const normalized = typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
  if (!normalized) {
    throw new Error("表示名を入力してください。");
  }
  if (normalized.length > 50) {
    throw new Error("表示名は50文字以内で入力してください。");
  }
  return normalized;
}

/**
 * 4桁数字が単純な昇順・降順の連番（例: 1234, 4321）か判定する。
 * @param {string} pin 4桁数字文字列
 * @returns {boolean} 連番の場合はtrue
 */
function isSequentialPin(pin) {
  const digits = Array.from(pin, Number);
  const step = digits[1] - digits[0];
  if (step !== 1 && step !== -1) return false;
  return digits[2] - digits[1] === step && digits[3] - digits[2] === step;
}

/**
 * 4桁数字PINの形式および単純PIN禁止要件を検証する。
 * @param {string} pin 検証するPIN
 * @returns {void}
 * @throws {Error} 要件を満たさない場合
 */
export function validatePinStrength(pin) {
  if (typeof pin !== "string" || pin.length === 0) {
    throw new Error("PINを入力してください。");
  }
  if (!PIN_PATTERN.test(pin)) {
    throw new Error("PINは半角数字4桁で入力してください。");
  }
  if (REPEATED_PIN_PATTERN.test(pin)) {
    throw new Error("同じ数字の連続（例: 0000）はPINに使用できません。");
  }
  if (isSequentialPin(pin)) {
    throw new Error("連続した数字（例: 1234 / 4321）はPINに使用できません。");
  }
}

/**
 * PBKDF2-SHA256によりソルト付きPINハッシュを生成する。
 * @param {string} pin 平文PIN
 * @param {Uint8Array} [saltBytes] 省略時は16バイトの乱数を生成
 * @param {number} [iterations=PBKDF2_ITERATIONS] 反復回数
 * @returns {Promise<{passwordHash: string, passwordSalt: string, hashAlgorithm: string, hashIterations: number}>}
 */
export async function derivePasswordHash(
  pin,
  saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH)),
  iterations = PBKDF2_ITERATIONS
) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    DERIVED_KEY_BITS
  );
  return {
    passwordHash: bytesToBase64(new Uint8Array(derivedBits)),
    passwordSalt: bytesToBase64(saltBytes),
    hashAlgorithm: HASH_ALGORITHM,
    hashIterations: iterations,
  };
}

/**
 * 入力PINがアカウントレコードのハッシュと一致するか検証する。
 * @param {string} pin 平文PIN
 * @param {{passwordHash?: string, passwordSalt?: string, hashAlgorithm?: string, hashIterations?: number}|null|undefined} account
 * @returns {Promise<boolean>} 一致する場合はtrue
 */
export async function verifyPasswordHash(pin, account) {
  if (
    typeof pin !== "string" ||
    !pin ||
    !account ||
    account.hashAlgorithm !== HASH_ALGORITHM ||
    typeof account.passwordHash !== "string" ||
    typeof account.passwordSalt !== "string" ||
    !Number.isInteger(account.hashIterations) ||
    account.hashIterations <= 0
  ) {
    return false;
  }

  try {
    const saltBytes = base64ToBytes(account.passwordSalt);
    const expectedBytes = base64ToBytes(account.passwordHash);
    const derived = await derivePasswordHash(pin, saltBytes, account.hashIterations);
    const actualBytes = base64ToBytes(derived.passwordHash);
    return constantTimeEqual(actualBytes, expectedBytes);
  } catch {
    return false;
  }
}
