import { $ } from "../dom.js";
import { applyFields, collectFields, MEMBER_FIELDS, SETTINGS_FIELDS, tx } from "./storage-core.js";
import { resetPdfState, setStatus } from "../services/pdf/pdf-core.js";

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
  const sel = $("memberSelect");
  const cur = sel.value;

  sel.innerHTML = '<option value="">（新規入力）</option>';

  const req = tx("members", "readonly").getAll();

  req.onsuccess = () => {
    req.result.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name || ("利用者#" + m.id);
      sel.appendChild(opt);
    });

    sel.value = cur;
  };
}

/**
 * 指定された利用者を読み込み、フォームと共有状態を更新する。
 * @param {string|number} id 利用者ID。空値の場合は選択を解除する
 * @returns {void}
 */
export function loadMember(id) {
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
  const sel = $("memberSelect");
  const data = collectFields(MEMBER_FIELDS);
  if (!data.name) { setStatus("氏名を入力してから保存してください"); return; }
  const store = tx("members", "readwrite");
  if (sel.value) { data.id = Number(sel.value); store.put(data); }
  else { store.add(data); }
  store.transaction.oncomplete = async () => {
    await loadMemberList();
    // 新規保存時は末尾を選択
    if (!sel.value) {
      const all = tx("members","readonly").getAll();
      all.onsuccess = () => { const last = all.result[all.result.length-1]; if (last) { sel.value = last.id; $("deleteMemberBtn").disabled = false; } };
    }
    setStatus("利用者「" + data.name + "」を保存しました", true);
  };
}

/**
 * 選択中の利用者を確認後に削除する。
 * @returns {Promise<void>}
 */
export async function deleteMember() {
  const sel = $("memberSelect");
  if (!sel.value) return;
  if (!confirm("この利用者データを削除しますか？")) return;
  const store = tx("members", "readwrite");
  store.delete(Number(sel.value));
  store.transaction.oncomplete = async () => {
    await loadMemberList();
    sel.value = "";
    $("deleteMemberBtn").disabled = true;
    setStatus("利用者を削除しました", true);
  };
}

/**
 * 画面の共通設定を1件のレコードとして保存する。
 * @returns {void}
 */
export function saveSettings() {
  const data = collectFields(SETTINGS_FIELDS);
  data.id = "singleton";
  const store = tx("settings", "readwrite");
  store.put(data);
  store.transaction.oncomplete = () => {
    activeSettings = data;
    setStatus("共通設定を保存しました", true);
  };
}

/**
 * 保存済み共通設定を読み込み、フォームと共有状態を更新する。
 * @returns {void}
 */
export function loadSettings() {
  const req = tx("settings", "readonly").get("singleton");

  req.onsuccess = () => {
    if (req.result) {
      activeSettings = req.result;
      applyFields(req.result);
    }

    settingsLoaded = true;
  };

  req.onerror = () => {
    settingsLoaded = true;
  };
}

export const getActiveMember = () => activeMember;
export const getActiveSettings = () => activeSettings;
export const areSettingsLoaded = () => settingsLoaded;
export const getMemberGeneration = () => memberGeneration;
