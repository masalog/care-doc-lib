import { $ } from "../dom.js";
import {
  applyFields,
  collectFields,
  getDB,
  MEMBER_FIELDS,
  SETTINGS_FIELDS,
  tx,
  withOperatorMetadata,
} from "./storage-core.js";
import { resetPdfState, setStatus } from "../services/pdf/pdf-core.js";
import { requireActiveSession } from "../services/auth/auth-service.js";

/**
 * 利用者と共通設定のIndexedDB読み書き、およびPDFプレビュー状態の管理を行う。
 * @fileoverview 利用者と共通設定のIndexedDB読み書き、PDFプレビュー状態の管理。
 */

let settingsLoaded = false;
let memberLoadSequence = 0;
let memberGeneration = 0;
let activeMember = null;
let activeSettings = {};

/**
 * 利用者一覧を読み込み、選択リストを更新する。
 * @returns {Promise<void>}
 */
export async function loadMemberList() {
  await requireActiveSession();
  const sel = $("memberSelect");
  const cur = sel.value;

  sel.innerHTML = '<option value="">（新規入力）</option>';

  return new Promise((resolve, reject) => {
    const req = tx("members", "readonly").getAll();
    req.onsuccess = () => {
      req.result.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name || ("利用者#" + m.id);
        sel.appendChild(opt);
      });

      sel.value = cur;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * 指定された利用者を読み込み、フォームと共有状態を更新する。
 * @param {string|number} id 利用者ID。空値の場合は選択を解除する
 * @returns {Promise<void>}
 */
export async function loadMember(id) {
  memberGeneration++;
  resetPdfState();

  const currentSequence = ++memberLoadSequence;
  const genBtn = $("genBtn");

  if (genBtn) genBtn.disabled = true;

  if (!id) {
    activeMember = null;

    if ($("deleteMemberBtn")) {
      $("deleteMemberBtn").disabled = true;
    }

    if (currentSequence === memberLoadSequence && genBtn) {
      genBtn.disabled = false;
    }

    return;
  }

  try {
    await requireActiveSession();
  } catch (error) {
    if (currentSequence === memberLoadSequence) {
      setStatus(error.message);
      if (genBtn) genBtn.disabled = false;
    }
    return;
  }

  const req = tx("members", "readonly").get(Number(id));

  req.onsuccess = () => {
    if (currentSequence !== memberLoadSequence) return;

    if (req.result) {
      activeMember = req.result;
      applyFields(req.result);

      if ($("deleteMemberBtn")) {
        $("deleteMemberBtn").disabled = false;
      }

      setStatus("利用者を読み込みました", true);
    }

    if (genBtn) {
      genBtn.disabled = false;
    }
  };

  req.onerror = () => {
    if (currentSequence !== memberLoadSequence) return;

    setStatus(
      req.error?.message ?? "利用者を読み込めませんでした",
      true
    );

    if (genBtn) {
      genBtn.disabled = false;
    }
  };
}

/**
 * 入力中の利用者情報を新規登録または更新する。
 * @returns {Promise<void>}
 */
export async function saveMember() {
  let session;
  try {
    session = await requireActiveSession();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  const sel = $("memberSelect");
  const data = collectFields(MEMBER_FIELDS);
  if (!data.name) { setStatus("氏名を入力してから保存してください"); return; }

  const transaction = getDB().transaction("members", "readwrite");
  const store = transaction.objectStore("members");
  if (sel.value) {
    const memberId = Number(sel.value);
    const getReq = store.get(memberId);
    getReq.onsuccess = () => {
      store.put(withOperatorMetadata({ ...data, id: memberId }, getReq.result, session));
    };
  } else {
    store.add(withOperatorMetadata(data, null, session));
  }

  transaction.oncomplete = async () => {
    await loadMemberList();
    // 新規保存時は末尾を選択
    if (!sel.value) {
      const all = tx("members", "readonly").getAll();
      all.onsuccess = () => {
        const last = all.result[all.result.length - 1];
        if (last) {
          sel.value = last.id;
          activeMember = last;
          if ($("deleteMemberBtn")) $("deleteMemberBtn").disabled = false;
        }
      };
    }
    setStatus("利用者「" + data.name + "」を保存しました", true);
  };
}

/**
 * 選択中の利用者を確認後に削除する。
 * @returns {Promise<void>}
 */
export async function deleteMember() {
  try {
    await requireActiveSession();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  const sel = $("memberSelect");
  if (!sel.value) return;
  if (!confirm("この利用者データを削除しますか？")) return;
  const store = tx("members", "readwrite");
  store.delete(Number(sel.value));
  store.transaction.oncomplete = async () => {
    await loadMemberList();
    sel.value = "";
    activeMember = null;
    if ($("deleteMemberBtn")) $("deleteMemberBtn").disabled = true;
    setStatus("利用者を削除しました", true);
  };
}

/**
 * 画面の共通設定を1件のレコードとして保存する。
 * @returns {Promise<void>}
 */
export async function saveSettings() {
  let session;
  try {
    session = await requireActiveSession();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  const data = collectFields(SETTINGS_FIELDS);
  const transaction = getDB().transaction("settings", "readwrite");
  const store = transaction.objectStore("settings");
  let savedRecord = null;
  const getReq = store.get("singleton");
  getReq.onsuccess = () => {
    savedRecord = withOperatorMetadata({ ...data, id: "singleton" }, getReq.result, session);
    store.put(savedRecord);
  };
  transaction.oncomplete = () => {
    activeSettings = savedRecord ?? data;
    setStatus("共通設定を保存しました", true);
  };
}

/**
 * 保存済み共通設定を読み込み、フォームと共有状態を更新する。
 * @returns {Promise<void>}
 */
export async function loadSettings() {
  await requireActiveSession();
  return new Promise((resolve) => {
    const req = tx("settings", "readonly").get("singleton");

    req.onsuccess = () => {
      if (req.result) {
        activeSettings = req.result;
        applyFields(req.result);
      }

      settingsLoaded = true;
      resolve();
    };

    req.onerror = () => {
      settingsLoaded = true;
      resolve();
    };
  });
}

export const getActiveMember = () => activeMember;
export const getActiveSettings = () => activeSettings;
export const areSettingsLoaded = () => settingsLoaded;
export const getMemberGeneration = () => memberGeneration;
