import {
  countAccounts,
  deleteAccountById,
  getAccount,
  insertAccount,
  listAccounts,
  putAccount,
} from "../../models/auth-store.js";
import {
  derivePasswordHash,
  normalizeAndValidateAccountId,
  normalizeAndValidateDisplayName,
  validatePinStrength,
  verifyPasswordHash,
} from "./password-hash.js";

/**
 * 認証・1ロール認可ガード・15分無操作ロック・アカウント管理を提供する。
 * @fileoverview 認証・認可・セッション制御サービス。
 */

export const SESSION_STORAGE_KEY = "caredoc.auth.session";
export const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 60 * 60 * 1000;

/**
 * @typedef {Object} AuthSession
 * @property {string} accountId ログイン中のアカウントID
 * @property {string} displayName ログイン中の表示名
 * @property {"staff"} role ロール
 * @property {string} loggedInAt ログイン日時（ISO 8601）
 * @property {number} lastActivityAt 最終操作時刻（UNIXエポックms）
 * @property {boolean} locked 画面ロック状態
 */

/**
 * 認証・認可エラーを表す例外クラス。
 */
export class AuthError extends Error {
  /**
   * @param {string} message 利用者向けエラーメッセージ
   * @param {string} [code="AUTH_REQUIRED"] エラー識別コード
   */
  constructor(message, code = "AUTH_REQUIRED") {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/** @type {((status: {state: string, session: AuthSession|null}) => void)|null} */
let authInvalidatedHandler = null;
/** @type {Storage|null} */
let customSessionStorage = null;

/**
 * セッション保存先のStorageを返す。
 * @returns {Storage} sessionStorage互換オブジェクト
 */
function getStorage() {
  if (customSessionStorage) return customSessionStorage;
  return window.sessionStorage;
}

/**
 * テスト用にsessionStorage代替オブジェクトを差し替える。
 * @param {Storage|null} storage テスト用ストレージ。nullでデフォルトに戻す
 * @returns {void}
 */
export function setSessionStorageForTest(storage) {
  customSessionStorage = storage;
}

/**
 * 認可ガード失敗時に呼び出すUI通知ハンドラを登録する。
 * @param {((status: {state: string, session: AuthSession|null}) => void)|null} handler ハンドラ
 * @returns {void}
 */
export function setAuthInvalidatedHandler(handler) {
  authInvalidatedHandler = handler;
}

/**
 * sessionStorageから現在のセッションを読み込む。
 * @returns {AuthSession|null} セッション。未保存または破損時はnull
 */
export function readSession() {
  try {
    const raw = getStorage().getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.accountId !== "string" ||
      !parsed.accountId
    ) {
      return null;
    }
    return {
      accountId: parsed.accountId,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : parsed.accountId,
      role: "staff",
      loggedInAt: typeof parsed.loggedInAt === "string" ? parsed.loggedInAt : new Date().toISOString(),
      lastActivityAt: Number(parsed.lastActivityAt),
      locked: Boolean(parsed.locked),
    };
  } catch {
    return null;
  }
}

/**
 * セッション情報をsessionStorageへ書き込む。
 * @param {AuthSession} session 保存するセッション
 * @returns {AuthSession} 保存されたセッション
 */
function writeSession(session) {
  getStorage().setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * セッション情報を削除する。
 * @returns {void}
 */
export function clearSession() {
  try {
    getStorage().removeItem(SESSION_STORAGE_KEY);
  } catch {
    // 無視
  }
}

/**
 * セッションが15分無操作タイムアウトに達しているか判定する。
 * @param {AuthSession} session 判定対象セッション
 * @param {number} [nowMs=Date.now()] 現在時刻（UNIXエポックms）
 * @returns {boolean} タイムアウト済みならtrue
 */
export function isSessionTimedOut(session, nowMs = Date.now()) {
  if (!session || !Number.isFinite(session.lastActivityAt)) {
    return true;
  }
  return nowMs - session.lastActivityAt >= LOCK_TIMEOUT_MS;
}

/**
 * 操作発生時に最終操作時刻を更新する。未ログイン・ロック中は更新しない。
 * タイムアウト超過時はロック状態へ移行する。
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {boolean} タイムアウトにより新たにロックした場合はtrue
 */
export function touchSessionActivity(nowMs = Date.now()) {
  const session = readSession();
  if (!session || session.locked) return false;
  if (isSessionTimedOut(session, nowMs)) {
    writeSession({ ...session, locked: true });
    return true;
  }
  writeSession({ ...session, lastActivityAt: nowMs });
  return false;
}

/**
 * 現在の認証状態（初回セットアップ／ログイン／ロック／認証済み）を判定する。
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<{state: "setup"|"login"|"locked"|"authenticated", session: AuthSession|null}>}
 */
export async function getAuthStatus(nowMs = Date.now()) {
  const totalAccounts = await countAccounts();
  if (totalAccounts === 0) {
    clearSession();
    return { state: "setup", session: null };
  }

  const session = readSession();
  if (!session) {
    return { state: "login", session: null };
  }

  const account = await getAccount(session.accountId);
  if (!account) {
    clearSession();
    return { state: "login", session: null };
  }

  const syncedSession = {
    ...session,
    displayName: account.displayName,
    role: "staff",
  };

  if (syncedSession.locked || isSessionTimedOut(syncedSession, nowMs)) {
    const lockedSession = { ...syncedSession, locked: true };
    writeSession(lockedSession);
    return { state: "locked", session: lockedSession };
  }

  writeSession(syncedSession);
  return { state: "authenticated", session: syncedSession };
}

/**
 * 認証済みかつ未ロックであることを検証し、現在のセッションを返す。
 * 未認証・ロック時は登録済みUIハンドラへ通知したうえでAuthErrorを送出する。
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<AuthSession>} 有効なセッション
 * @throws {AuthError} 未認証、ロック中、またはアカウント無効時
 */
export async function requireActiveSession(nowMs = Date.now()) {
  const status = await getAuthStatus(nowMs);
  if (status.state === "authenticated" && status.session) {
    return status.session;
  }
  if (authInvalidatedHandler) {
    authInvalidatedHandler(status);
  }
  if (status.state === "locked") {
    throw new AuthError("画面がロックされています。PINを入力して解除してください。", "SESSION_LOCKED");
  }
  throw new AuthError("ログインが必要です。再度ログインしてください。", "AUTH_REQUIRED");
}

/**
 * アカウントのパスワード検証と連続失敗ロックアウト制御を行う共通ヘルパー。
 * @param {import("../../models/auth-store.js").AccountRecord} account 対象アカウント
 * @param {string} password 入力されたパスワード
 * @param {string} failureMessage 不一致時のエラーメッセージ
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<import("../../models/auth-store.js").AccountRecord>} 検証成功したアカウント
 */
async function verifyAccountCredentials(account, password, failureMessage, nowMs = Date.now()) {
  if (account.lockedUntil) {
    const lockedUntilMs = Date.parse(account.lockedUntil);
    if (Number.isFinite(lockedUntilMs) && lockedUntilMs > nowMs) {
      const remainMs = lockedUntilMs - nowMs;
      const remainLabel = remainMs >= 60 * 1000
        ? `約 ${Math.ceil(remainMs / (60 * 1000))} 分`
        : `約 ${Math.max(1, Math.ceil(remainMs / 1000))} 秒`;
      throw new AuthError(
        `連続して認証に失敗したため一時ロック中です（あと${remainLabel}お待ちください）。`,
        "LOCKED_OUT"
      );
    }
  }

  const matched = await verifyPasswordHash(password, account);
  if (!matched) {
    const nextFailedCount = (Number(account.failedCount) || 0) + 1;
    if (nextFailedCount >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(nowMs + LOCKOUT_DURATION_MS).toISOString();
      await putAccount({
        ...account,
        failedCount: 0,
        lockedUntil,
        updatedAt: new Date(nowMs).toISOString(),
      });
      throw new AuthError(
        "連続して5回認証に失敗したため、1時間ログイン・ロック解除を制限します。",
        "LOCKED_OUT"
      );
    }

    await putAccount({
      ...account,
      failedCount: nextFailedCount,
      lockedUntil: null,
      updatedAt: new Date(nowMs).toISOString(),
    });
    throw new AuthError(failureMessage, "INVALID_CREDENTIALS");
  }

  if ((Number(account.failedCount) || 0) !== 0 || account.lockedUntil !== null) {
    const cleared = {
      ...account,
      failedCount: 0,
      lockedUntil: null,
      updatedAt: new Date(nowMs).toISOString(),
    };
    await putAccount(cleared);
    return cleared;
  }
  return account;
}

/**
 * 新規アカウントレコードを構築してIndexedDBへ登録する共通処理。
 * @param {{accountId: string, displayName: string, password: string, confirmPassword: string}} input 入力値
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<import("../../models/auth-store.js").AccountRecord>} 登録済みレコード
 */
async function createValidatedAccountRecord(input, nowMs = Date.now()) {
  const accountId = normalizeAndValidateAccountId(input?.accountId);
  const displayName = normalizeAndValidateDisplayName(input?.displayName);
  const password = typeof input?.password === "string" ? input.password : "";
  const confirmPassword = typeof input?.confirmPassword === "string" ? input.confirmPassword : "";

  validatePinStrength(password);
  if (password !== confirmPassword) {
    throw new Error("PINと確認用PINが一致しません。");
  }

  const derived = await derivePasswordHash(password);
  const nowIso = new Date(nowMs).toISOString();
  return insertAccount({
    accountId,
    displayName,
    role: "staff",
    ...derived,
    failedCount: 0,
    lockedUntil: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

/**
 * アカウント0件の初回起動時に最初のアカウントを登録し、ログイン状態を開始する。
 * @param {{accountId: string, displayName: string, password: string, confirmPassword: string}} input 入力値
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<AuthSession>} 確立されたセッション
 */
export async function setupInitialAccount(input, nowMs = Date.now()) {
  const existingCount = await countAccounts();
  if (existingCount > 0) {
    throw new AuthError("初期設定はすでに完了しています。ログインしてください。", "ALREADY_INITIALIZED");
  }

  const record = await createValidatedAccountRecord(input, nowMs);
  const nowIso = new Date(nowMs).toISOString();
  return writeSession({
    accountId: record.accountId,
    displayName: record.displayName,
    role: "staff",
    loggedInAt: nowIso,
    lastActivityAt: nowMs,
    locked: false,
  });
}

/**
 * アカウントIDとパスワードでログインする。
 * @param {{accountId: string, password: string}} input ログイン情報
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<AuthSession>} 確立されたセッション
 */
export async function login(input, nowMs = Date.now()) {
  const rawId = typeof input?.accountId === "string" ? input.accountId.trim().toLowerCase() : "";
  const password = typeof input?.password === "string" ? input.password : "";
  const genericMessage = "アカウントIDまたはPINが正しくありません。";

  if (!rawId || !password) {
    throw new AuthError("アカウントIDとPINを入力してください。", "INVALID_INPUT");
  }

  const account = await getAccount(rawId);
  if (!account) {
    throw new AuthError(genericMessage, "INVALID_CREDENTIALS");
  }

  const verified = await verifyAccountCredentials(account, password, genericMessage, nowMs);
  return writeSession({
    accountId: verified.accountId,
    displayName: verified.displayName,
    role: "staff",
    loggedInAt: new Date(nowMs).toISOString(),
    lastActivityAt: nowMs,
    locked: false,
  });
}

/**
 * 現在のセッションを手動または自動タイムアウトでロックする。
 * @returns {AuthSession|null} ロック後のセッション
 */
export function lockSession() {
  const session = readSession();
  if (!session) return null;
  return writeSession({ ...session, locked: true });
}

/**
 * ロック中のセッションをパスワード再入力により解除する。
 * @param {string} password 現在のログインユーザーのパスワード
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<AuthSession>} 解除後のセッション
 */
export async function unlockSession(password, nowMs = Date.now()) {
  const session = readSession();
  if (!session) {
    throw new AuthError("セッションが見つかりません。再度ログインしてください。", "AUTH_REQUIRED");
  }
  if (typeof password !== "string" || !password) {
    throw new AuthError("PINを入力してください。", "INVALID_INPUT");
  }

  const account = await getAccount(session.accountId);
  if (!account) {
    clearSession();
    throw new AuthError("このアカウントは現在利用できません。再度ログインしてください。", "SESSION_INVALID");
  }

  const verified = await verifyAccountCredentials(
    account,
    password,
    "PINが正しくありません。",
    nowMs
  );
  return writeSession({
    ...session,
    displayName: verified.displayName,
    role: "staff",
    lastActivityAt: nowMs,
    locked: false,
  });
}

/**
 * ログアウトしてセッションを破棄する。
 * @returns {void}
 */
export function logout() {
  clearSession();
}

/**
 * 画面表示用にハッシュ等を除いたアカウント一覧を返す。
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<Array<{accountId: string, displayName: string, role: string, createdAt: string, updatedAt: string}>>}
 */
export async function listManagedAccounts(nowMs = Date.now()) {
  await requireActiveSession(nowMs);
  const accounts = await listAccounts();
  return accounts.map((account) => ({
    accountId: account.accountId,
    displayName: account.displayName,
    role: account.role,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }));
}

/**
 * ログイン中の担当者が新しい担当者アカウントを作成する。
 * @param {{accountId: string, displayName: string, password: string, confirmPassword: string}} input
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<{accountId: string, displayName: string, role: string, createdAt: string, updatedAt: string}>}
 */
export async function createManagedAccount(input, nowMs = Date.now()) {
  await requireActiveSession(nowMs);
  const created = await createValidatedAccountRecord(input, nowMs);
  return {
    accountId: created.accountId,
    displayName: created.displayName,
    role: created.role,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

/**
 * アカウントの表示名を更新する。ログイン中本人の場合はセッション表示名も更新する。
 * @param {string} targetAccountId 対象アカウントID
 * @param {string} newDisplayName 新しい表示名
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<{accountId: string, displayName: string}>}
 */
export async function updateManagedDisplayName(targetAccountId, newDisplayName, nowMs = Date.now()) {
  const session = await requireActiveSession(nowMs);
  const account = await getAccount(targetAccountId);
  if (!account) {
    throw new Error("対象のアカウントが見つかりません。");
  }
  const displayName = normalizeAndValidateDisplayName(newDisplayName);
  const updated = {
    ...account,
    displayName,
    updatedAt: new Date(nowMs).toISOString(),
  };
  await putAccount(updated);
  if (session.accountId === updated.accountId) {
    writeSession({ ...session, displayName });
  }
  return { accountId: updated.accountId, displayName: updated.displayName };
}

/**
 * 操作中アカウントのPINを再確認する共通ヘルパー。
 * @param {string} operatorAccountId 操作中のアカウントID
 * @param {string} operatorPassword 入力されたPIN
 * @param {number} nowMs 現在時刻
 * @param {string} emptyMessage 未入力時のエラーメッセージ
 * @returns {Promise<import("../../models/auth-store.js").AccountRecord>} 確認済み操作者アカウント
 */
async function verifyOperatorPin(operatorAccountId, operatorPassword, nowMs, emptyMessage) {
  const operatorAccount = await getAccount(operatorAccountId);
  if (!operatorAccount) {
    clearSession();
    throw new AuthError("操作者のアカウントが存在しません。再ログインしてください。", "SESSION_INVALID");
  }
  const pin = typeof operatorPassword === "string" ? operatorPassword : "";
  if (!pin) {
    throw new Error(emptyMessage);
  }
  return verifyAccountCredentials(
    operatorAccount,
    pin,
    "確認用PIN（現在のPIN）が正しくありません。",
    nowMs
  );
}

/**
 * アカウントのPINを変更・再設定する。
 * 操作者（ログイン中ユーザー）の現在のPIN確認を必須とする。
 * @param {{targetAccountId: string, operatorPassword: string, newPassword: string, confirmPassword: string}} input
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<void>}
 */
export async function changeManagedPassword(input, nowMs = Date.now()) {
  const session = await requireActiveSession(nowMs);
  const targetAccount = await getAccount(input?.targetAccountId);
  if (!targetAccount) {
    throw new Error("対象のアカウントが見つかりません。");
  }
  await verifyOperatorPin(
    session.accountId,
    input?.operatorPassword,
    nowMs,
    "確認のため、現在のログインユーザーのPINを入力してください。"
  );

  const newPassword = typeof input?.newPassword === "string" ? input.newPassword : "";
  const confirmPassword = typeof input?.confirmPassword === "string" ? input.confirmPassword : "";
  validatePinStrength(newPassword);
  if (newPassword !== confirmPassword) {
    throw new Error("新しいPINと確認用PINが一致しません。");
  }

  const derived = await derivePasswordHash(newPassword);
  await putAccount({
    ...targetAccount,
    ...derived,
    failedCount: 0,
    lockedUntil: null,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

/**
 * アカウントを削除する。最後の1件を削除する場合は現在のPIN再入力を必須とする。
 * 自分自身を削除した場合はセッションを破棄する。
 * @param {string} targetAccountId 削除対象のアカウントID
 * @param {{operatorPassword?: string}} [options={}] 削除オプション
 * @param {number} [nowMs=Date.now()] 現在時刻
 * @returns {Promise<{accountId: string, selfDeleted: boolean, remainingCount: number}>}
 */
export async function deleteManagedAccount(targetAccountId, options = {}, nowMs = Date.now()) {
  const session = await requireActiveSession(nowMs);
  const normalizedTarget = typeof targetAccountId === "string" ? targetAccountId.trim().toLowerCase() : "";
  const accounts = await listAccounts();
  const target = accounts.find((item) => item.accountId === normalizedTarget);
  if (!target) {
    throw new Error("対象のアカウントが見つかりません。");
  }

  if (accounts.length <= 1) {
    await verifyOperatorPin(
      session.accountId,
      options?.operatorPassword,
      nowMs,
      "最後のアカウントを削除するには、確認のため現在のPINを入力してください。"
    );
  }

  const deleted = await deleteAccountById(target.accountId);
  const selfDeleted = deleted.accountId === session.accountId;
  if (selfDeleted) {
    clearSession();
  }
  return {
    accountId: deleted.accountId,
    selfDeleted,
    remainingCount: accounts.length - 1,
  };
}
