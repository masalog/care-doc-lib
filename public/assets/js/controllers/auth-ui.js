import { $ } from "../dom.js";
import { openDB } from "../models/storage-core.js";
import {
  getAuthStatus,
  lockSession,
  login,
  logout,
  setAuthInvalidatedHandler,
  setupInitialAccount,
  touchSessionActivity,
  unlockSession,
} from "../services/auth/auth-service.js";

/**
 * 初回セットアップ、ログイン、15分自動ロック解除、ヘッダー表示の共通UI制御を行う。
 * @fileoverview 認証・ロック画面オーバーレイとセッション監視UI。
 */

const ACTIVITY_THROTTLE_MS = 5000;
const LOCK_CHECK_INTERVAL_MS = 15000;

/** @type {boolean} */
let initializedBusinessPage = false;
/** @type {Promise<void>|null} */
let businessPageInitializationPromise = null;
/** @type {((session: import("../services/auth/auth-service.js").AuthSession) => Promise<void>|void)|null} */
let authenticatedCallback = null;
/** @type {number} */
let lastTouchReportedAt = 0;
/** @type {boolean} */
let watchersBound = false;
/** @type {HTMLElement|null} */
let lastFocusedElement = null;

/**
 * 入力欄用のラベル付きグループDOM要素を作成する。
 * @param {string} id 入力要素のID
 * @param {string} labelText ラベル文言
 * @param {string} type input type
 * @param {{autocomplete?: string, placeholder?: string, inputMode?: string, maxLength?: number, pattern?: string}} [options]
 * @returns {{group: HTMLDivElement, input: HTMLInputElement}}
 */
function createInputGroup(id, labelText, type, options = {}) {
  const group = document.createElement("div");
  group.className = "form-group";

  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;

  const input = document.createElement("input");
  input.id = id;
  input.type = type;
  input.required = true;
  if (options.autocomplete) input.autocomplete = options.autocomplete;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.inputMode) input.inputMode = options.inputMode;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.pattern) input.pattern = options.pattern;

  group.append(label, input);
  return { group, input };
}

/**
 * 4桁数字PIN入力欄向けの共通オプションを返す。
 * @param {string} autocomplete autocomplete属性値
 * @returns {{autocomplete: string, inputMode: string, maxLength: number, pattern: string, placeholder: string}}
 */
function createPinInputOptions(autocomplete) {
  return {
    autocomplete,
    inputMode: "numeric",
    maxLength: 4,
    pattern: "[0-9]{4}",
    placeholder: "半角数字4桁",
  };
}

/**
 * ログイン中のヘッダー表示（担当者名・画面ロック・ログアウト）を更新する。
 * @param {import("../services/auth/auth-service.js").AuthSession|null} session
 * @returns {void}
 */
export function updateHeaderAuthBar(session) {
  const bar = $("auth-user-bar");
  if (!bar) return;
  bar.replaceChildren();
  if (!session) return;

  const userLabel = document.createElement("span");
  userLabel.className = "auth-user-name";
  userLabel.textContent = `担当者: ${session.displayName} (${session.accountId})`;

  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = "btn btn-header";
  lockBtn.textContent = "画面ロック";
  lockBtn.addEventListener("click", () => {
    const locked = lockSession();
    if (locked) {
      renderAuthOverlay({ state: "locked", session: locked });
    }
  });

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "btn btn-header";
  logoutBtn.textContent = "ログアウト";
  logoutBtn.addEventListener("click", () => {
    logout();
    window.location.reload();
  });

  bar.append(userLabel, lockBtn, logoutBtn);
}

/**
 * 認証状態に応じてオーバーレイを表示または解除する。
 * @param {{state: string, session: import("../services/auth/auth-service.js").AuthSession|null}} status
 * @returns {Promise<void>}
 */
async function applyAuthStatus(status) {
  if (status.state === "authenticated" && status.session) {
    hideAuthOverlay();
    updateHeaderAuthBar(status.session);
    if (!initializedBusinessPage && authenticatedCallback) {
      if (!businessPageInitializationPromise) {
        businessPageInitializationPromise = Promise.resolve(
          authenticatedCallback(status.session)
        )
          .then(() => {
            initializedBusinessPage = true;
          })
          .catch((error) => {
            initializedBusinessPage = false;
            businessPageInitializationPromise = null;
            throw error;
          });
      }

      await businessPageInitializationPromise;
    }
    return;
  }

  renderAuthOverlay(status);
}

/**
 * オーバーレイを非表示にして業務画面を表示可能にする。
 * @returns {void}
 */
function hideAuthOverlay() {
  const overlay = $("login-overlay");
  if (overlay) {
    overlay.classList.add("hidden");
    overlay.dataset.mode = "";
    overlay.dataset.accountId = "";
    overlay.replaceChildren();
  }
  document.body.classList.remove("auth-pending");

  if (
    lastFocusedElement &&
    document.contains(lastFocusedElement) &&
    !lastFocusedElement.hasAttribute("disabled")
  ) {
    lastFocusedElement.focus();
  }

  lastFocusedElement = null;

}

/**
 * 初回セットアップ／ログイン／画面ロック解除オーバーレイを描画する。
 * @param {{state: string, session: import("../services/auth/auth-service.js").AuthSession|null}} status
 * @returns {void}
 */
function renderAuthOverlay(status) {
  const overlay = $("login-overlay");
  if (!overlay) return;

  if (
    status.state === "locked" &&
    !lastFocusedElement &&
    document.activeElement instanceof HTMLElement &&
    !overlay.contains(document.activeElement)
  ) {
    lastFocusedElement = document.activeElement;
  }

  const accountKey = status.session?.accountId ?? "";
  if (
    !overlay.classList.contains("hidden") &&
    overlay.dataset.mode === status.state &&
    overlay.dataset.accountId === accountKey
  ) {
    return;
  }

  document.body.classList.add("auth-pending");
  overlay.classList.remove("hidden");
  overlay.dataset.mode = status.state;
  overlay.dataset.accountId = accountKey;
  overlay.replaceChildren();

  const header = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.textContent = "CareDocLib";
  const subtitle = document.createElement("p");
  subtitle.textContent = "介護認定申請書 作成アプリ";
  header.append(h1, subtitle);

  const main = document.createElement("main");
  const card = document.createElement("section");
  card.className = "section auth-card";

  const heading = document.createElement("h2");
  const description = document.createElement("p");
  description.className = "notice";
  const form = document.createElement("form");
  const messageBox = document.createElement("div");
  messageBox.className = "message";
  messageBox.setAttribute("role", "alert");

  const setError = (msg) => {
    messageBox.textContent = msg;
    messageBox.classList.add("error");
  };

  if (status.state === "setup") {
    heading.textContent = "初回アカウント登録";
    description.textContent =
      "最初にユーザーアカウントを登録してください（全アカウント共通権限・15分無操作で自動ロック）。";

    const idField = createInputGroup("auth-setup-id", "アカウントID（半角英数字・-・_ / 2〜32文字）", "text", {
      autocomplete: "username",
      placeholder: "例: yamada",
    });
    const nameField = createInputGroup("auth-setup-name", "表示名", "text", {
      autocomplete: "name",
      placeholder: "例: 山田 太郎",
    });
    const passField = createInputGroup(
      "auth-setup-pass",
      "PIN（半角数字4桁）",
      "password",
      createPinInputOptions("new-password")
    );
    const confirmField = createInputGroup(
      "auth-setup-confirm",
      "PIN（確認）",
      "password",
      createPinInputOptions("new-password")
    );

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = "登録して開始";

    form.append(idField.group, nameField.group, passField.group, confirmField.group, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      messageBox.textContent = "";
      messageBox.classList.remove("error");
      try {
        const session = await setupInitialAccount({
          accountId: idField.input.value,
          displayName: nameField.input.value,
          password: passField.input.value,
          confirmPassword: confirmField.input.value,
        });
        await applyAuthStatus({ state: "authenticated", session });
      } catch (error) {
        setError(error.message);
        submit.disabled = false;
      }
    });
  } else if (status.state === "locked" && status.session) {
    heading.textContent = "画面ロック中";
    description.textContent =
      `操作がない状態が15分続いたか、手動でロックされました。現在の担当者「${status.session.displayName} (${status.session.accountId})」の4桁PINを再入力してください。`;

    const passField = createInputGroup(
      "auth-unlock-pass",
      "PIN（半角数字4桁）",
      "password",
      createPinInputOptions("current-password")
    );

    const actions = document.createElement("div");
    actions.className = "form-actions";

    const unlockBtn = document.createElement("button");
    unlockBtn.type = "submit";
    unlockBtn.className = "btn btn-primary";
    unlockBtn.textContent = "ロック解除";

    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    switchBtn.className = "btn btn-secondary";
    switchBtn.textContent = "ログアウトして別担当者でログイン";
    switchBtn.addEventListener("click", () => {
      logout();
      window.location.reload();
    });

    actions.append(unlockBtn, switchBtn);
    form.append(passField.group, actions);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      unlockBtn.disabled = true;
      messageBox.textContent = "";
      messageBox.classList.remove("error");
      try {
        const session = await unlockSession(passField.input.value);
        await applyAuthStatus({ state: "authenticated", session });
      } catch (error) {
        setError(error.message);
        passField.input.value = "";
        passField.input.focus();
        unlockBtn.disabled = false;
      }
    });
  } else {
    heading.textContent = "ログイン";
    description.textContent = "担当者アカウントのIDと4桁のPINを入力してください。";

    const idField = createInputGroup("auth-login-id", "アカウントID", "text", {
      autocomplete: "username",
    });
    const passField = createInputGroup(
      "auth-login-pass",
      "PIN（半角数字4桁）",
      "password",
      createPinInputOptions("current-password")
    );

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = "ログイン";

    form.append(idField.group, passField.group, submit);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      messageBox.textContent = "";
      messageBox.classList.remove("error");
      try {
        const session = await login({
          accountId: idField.input.value,
          password: passField.input.value,
        });
        await applyAuthStatus({ state: "authenticated", session });
      } catch (error) {
        setError(error.message);
        passField.input.value = "";
        passField.input.focus();
        submit.disabled = false;
      }
    });
  }

  card.append(heading, description, form, messageBox);
  main.appendChild(card);
  overlay.append(header, main);

  const firstInput = form.querySelector("input");
  if (firstInput) firstInput.focus();
}

/**
 * 15分無操作ロック用の操作監視・定期チェックを登録する。
 * @returns {void}
 */
function bindInactivityWatchers() {
  if (watchersBound) return;
  watchersBound = true;

  const onActivity = () => {
    const now = Date.now();
    if (now - lastTouchReportedAt < ACTIVITY_THROTTLE_MS) return;
    lastTouchReportedAt = now;
    const lockedByTimeout = touchSessionActivity(now);
    if (lockedByTimeout) {
      getAuthStatus(now).then(applyAuthStatus).catch(() => {});
    }
  };

  ["pointerdown", "keydown", "input", "change", "scroll"].forEach((eventName) => {
    document.addEventListener(eventName, onActivity, { passive: true });
  });

  const checkTimeout = () => {
    if (document.body.classList.contains("auth-pending")) return;
    getAuthStatus().then((status) => {
      if (status.state !== "authenticated") {
        return applyAuthStatus(status);
      }
      return undefined;
    }).catch(() => {});
  };

  window.setInterval(checkTimeout, LOCK_CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      checkTimeout();
    }
  });
}

/**
 * ページの認証ゲートを初期化し、認証完了後に業務初期化コールバックを実行する。
 * @param {{onAuthenticated: (session: import("../services/auth/auth-service.js").AuthSession) => Promise<void>|void}} options
 * @returns {Promise<void>}
 */
export async function initAuthGate({ onAuthenticated }) {
  authenticatedCallback = onAuthenticated;
  setAuthInvalidatedHandler((status) => {
    renderAuthOverlay(status);
  });

  bindInactivityWatchers();

  try {
    await openDB();
    const status = await getAuthStatus();
    await applyAuthStatus(status);
  } catch (error) {
    renderAuthOverlay({ state: "login", session: null });
    const msg = document.querySelector("#login-overlay .message");
    if (msg) {
      msg.textContent = `認証機能の初期化に失敗しました: ${error.message}`;
      msg.classList.add("error");
    }
  }
}
