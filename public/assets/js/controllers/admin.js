import { $ } from "../dom.js";
import { MEMBER_FIELDS, openDB, SETTINGS_FIELDS, tx } from "../models/storage-core.js";
import { seedIfEmpty } from "../models/storage-seed.js";
import { exportBackup, importBackup } from "../services/backup/storage-backup.js";

/**
 * 管理画面の操作、表示更新、フォームとデータ層の連携を行う。
 * @fileoverview 管理画面の操作、表示更新、フォームとデータ層の連携。
 */
/** @type {HTMLFormElement} */
const memberForm = $("member-form");
/** @type {HTMLFormElement} */
const settingsForm = $("settings-form");
/** @type {Array<Record<string, string|number>>} */
let adminMembers = [];

/**
 * 管理画面のメッセージ領域を更新する。
 * @param {string} id メッセージ要素のID
 * @param {string} message 表示するメッセージ
 * @param {boolean} [isError=false] エラーとして表示する場合はtrue
 * @returns {void}
 */
function showAdminMessage(id, message, isError = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", !isError && Boolean(message));
}

/**
 * 指定した管理画面セクションを表示し、ナビゲーション状態を更新する。
 * @param {string} name 表示するセクション名
 * @param {HTMLElement|null} button 選択中ボタン。指定しない場合は選択状態を追加しない
 * @returns {void}
 */
function showSection(name, button) {
  $("section-members").classList.toggle("hidden", name !== "members");
  $("section-settings").classList.toggle("hidden", name !== "settings");
  $("section-backup").classList.toggle("hidden", name !== "backup");
  document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
  if (button) button.classList.add("active");
}

/**
 * ナビゲーション、利用者、設定、バックアップ関連のイベントを登録する。
 * @returns {void}
 */
function bindAdminActions() {
  document.querySelectorAll("[data-section]").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section, button));
  });
  $("new-member-btn").addEventListener("click", () => showMemberForm());
  $("save-member-btn").addEventListener("click", saveMember);
  $("cancel-member-btn").addEventListener("click", hideMemberForm);
  $("save-settings-btn").addEventListener("click", saveSettings);
  $("export-backup-btn").addEventListener("click", async () => {
    showAdminMessage("backup-message", "");
    try {
      const backup = await exportBackup();
      showAdminMessage(
        "backup-message",
        `利用者 ${backup.members.length} 件・共通設定 ${backup.settings ? "あり" : "なし"} を書き出しました。`
      );
    } catch (error) {
      showAdminMessage(
        "backup-message",
        `バックアップを書き出せませんでした: ${error.message}`,
        true
      );
    }
  });
  $("import-backup-file").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const file = input.files[0];
    if (!file) return;

    showAdminMessage("backup-message", "");
    try {
      const result = await importBackup(file, () =>
        Promise.all([refreshMembers(), loadAdminSettings()]));
      if (result) {
        showAdminMessage(
          "backup-message",
          `バックアップを復元しました（利用者 ${result.membersCount} 件・共通設定 ${result.hasSettings ? "あり" : "なし"}）。`
        );
      }
    } catch (error) {
      showAdminMessage("backup-message", `バックアップを復元できませんでした: ${error.message}`, true);
    } finally {
      input.value = "";
    }
  });
}

/**
 * 指定範囲の値を選択要素に設定する。
 * @param {string} id 選択要素のID
 * @param {number} first 先頭値
 * @param {number} last 末尾値
 * @returns {void}
 */
function fillDateSelect(id, first, last) {
  const select = $(id);
  select.replaceChildren(new Option("--", ""));
  for (let value = first; value <= last; value += 1) {
    select.add(new Option(String(value), String(value)));
  }
}

/**
 * 利用者フォームの日付選択肢を現在年に基づいて設定する。
 * @returns {void}
 */
function prepareDateFields() {
  const thisYear = new Date().getFullYear();
  ["m-birth-year", "m-start-year", "m-end-year", "m-inst-year"].forEach((id) =>
    fillDateSelect(id, thisYear - 120, thisYear + 2));
  ["m-birth-month", "m-start-month", "m-end-month", "m-inst-month"].forEach((id) =>
    fillDateSelect(id, 1, 12));
  ["m-birth-day", "m-start-day", "m-end-day", "m-inst-day"].forEach((id) =>
    fillDateSelect(id, 1, 31));
}

/**
 * 指定フィールドのデータをフォームに反映し、既存値が選択肢にない場合は追加する。
 * @param {HTMLFormElement} form 値を設定するフォーム
 * @param {Record<string, string|number|null|undefined>} values 反映するデータ
 * @param {string[]} fields 反映対象のフィールド名
 * @returns {void}
 */
function setFormValues(form, values, fields) {
  fields.forEach((field) => {
    const input = form.elements.namedItem(field);
    if (!input) return;

    const value = values[field] ?? "";

    // SELECTで選択肢に存在しない値は追加する
    if (
      input instanceof HTMLSelectElement &&
      value !== "" &&
      !Array.from(input.options).some(
        (option) => option.value === String(value)
      )
    ) {
      input.add(new Option(String(value), String(value)));
    }

    input.value = value;
  });
}

/**
 * フォームから指定フィールドの文字列値を収集する。
 * @param {HTMLFormElement} form 値を取得するフォーム
 * @param {string[]} fields 取得対象のフィールド名
 * @returns {Record<string, string>} フィールド名と入力値の組
 */
function getFormValues(form, fields) {
  return Object.fromEntries(fields.map((field) => [
    field,
    form.elements.namedItem(field).value.trim(),
  ]));
}

/**
 * 生年月日を検証する。いずれかが未入力の場合は既存仕様に従い有効とする。
 * @param {string} year 年
 * @param {string} month 月
 * @param {string} day 日
 * @returns {boolean} 有効な日付または未入力の場合はtrue
 */
function isValidDate(year, month, day) {
  // 未入力は既存仕様どおり許可
  if (!year || !month || !day) return true;

  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  return (
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  );
}

/**
 * 新規登録または指定利用者の編集フォームを表示する。
 * @param {string|number} [memberId=""] 編集対象の利用者ID。空の場合は新規登録
 * @returns {void}
 */
function showMemberForm(memberId = "") {
  memberForm.reset();
  $("member-id").value = "";
  if (memberId !== "") {
    const member = adminMembers.find((item) => String(item.id) === String(memberId));
    if (!member) {
      showAdminMessage("member-message", "選択した利用者が見つかりません。", true);
      return;
    }
    $("member-form-title").textContent = "利用者情報を編集";
    $("member-id").value = member.id;
    setFormValues(memberForm, member, MEMBER_FIELDS);
  } else {
    $("member-form-title").textContent = "利用者登録";
  }
  $("member-form-container").classList.remove("hidden");
  $("member-form-container").scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * 利用者フォームを閉じ、入力状態をリセットする。
 * @returns {void}
 */
function hideMemberForm() {
  $("member-form-container").classList.add("hidden");
  memberForm.reset();
  $("member-id").value = "";
}

/**
 * 利用者一覧を画面に描画する。
 * @returns {void}
 */
function renderMemberList() {
  const container = $("member-list");
  container.replaceChildren();
  if (adminMembers.length === 0) {
    container.textContent = "登録されている利用者はいません。";
    return;
  }

  const table = document.createElement("table");
  table.className = "member-table";
  const head = table.createTHead().insertRow();
  ["氏名", "被保険者番号", "介護度", "操作"].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    head.appendChild(cell);
  });

  const body = table.createTBody();
  adminMembers.forEach((member) => {
    const row = body.insertRow();
    [member.name || "", member.insuranceIdNumber || "", member.careLevel || ""].forEach((value) => {
      row.insertCell().textContent = value;
    });
    const actions = row.insertCell();
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-edit";
    edit.textContent = "編集";
    edit.addEventListener("click", () => showMemberForm(member.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-danger";
    remove.textContent = "削除";
    remove.addEventListener("click", () => removeMember(member.id));
    actions.append(edit, remove);
    });
  container.appendChild(table);
}

/**
 * IndexedDBから利用者を取得し、一覧表示を更新する。
 * @returns {Promise<void>} 読み込みと描画の完了
 */
function refreshMembers() {
  return new Promise((resolve, reject) => {
    const request = tx("members", "readonly").getAll();
    request.onsuccess = () => {
      adminMembers = request.result;
      renderMemberList();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 利用者フォームの入力を検証し、新規登録または更新する。
 * @returns {void}
 */
function saveMember() {
  if (!memberForm.reportValidity()) return;

  const data = getFormValues(memberForm, MEMBER_FIELDS);

  // 氏名チェック
  if (!data.name) {
    showAdminMessage(
      "member-message",
      "氏名を入力してください。",
      true
    );
    return;
  }

  // 生年月日チェック
  if (
    !isValidDate(
      data.birthYear,
      data.birthMonth,
      data.birthDay
    )
  ) {
    showAdminMessage(
      "member-message",
      "生年月日が正しくありません。",
      true
    );
    return;
  }

  const id = $("member-id").value;
  const store = tx("members", "readwrite");

  const request = id
    ? store.put({ ...data, id: Number(id) })
    : store.add(data);

  request.onerror = () =>
    showAdminMessage(
      "member-message",
      request.error?.message ?? "保存できませんでした。",
      true
    );

  request.onsuccess = async () => {
    try {
      await refreshMembers();
      hideMemberForm();

      showAdminMessage(
        "member-message",
        `利用者「${data.name}」を保存しました。`
      );
    } catch (error) {
      showAdminMessage(
        "member-message",
        `利用者一覧を更新できませんでした: ${error.message}`,
        true
      );
    }
  };
}

/**
 * 指定した利用者を確認後に削除し、一覧を再読み込みする。
 * @param {number} memberId 削除する利用者ID
 * @returns {void}
 */
function removeMember(memberId) {
  const member = adminMembers.find((item) => item.id === memberId);
  if (!member || !confirm(`利用者「${member.name}」を削除しますか？`)) return;
  const store = tx("members", "readwrite");
  const request = store.delete(memberId);
  request.onerror = () => showAdminMessage("member-message", request.error.message, true);
  request.onsuccess = async () => {
    try {
      await refreshMembers();
      showAdminMessage("member-message", "利用者を削除しました。");
    } catch (error) {
      showAdminMessage("member-message", `利用者一覧を更新できませんでした: ${error.message}`, true);
    }
  };
}

/**
 * 保存済み共通設定を読み込み、管理フォームに反映する。
 * @returns {Promise<void>} 読み込みの完了
 */
function loadAdminSettings() {
  return new Promise((resolve, reject) => {
    const request = tx("settings", "readonly").get("singleton");
    request.onsuccess = () => {
      setFormValues(settingsForm, request.result ?? {}, SETTINGS_FIELDS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * 管理画面の共通設定を保存する。
 * @returns {void}
 */
function saveSettings() {
  const data = getFormValues(settingsForm, SETTINGS_FIELDS);
  data.id = "singleton";

  const store = tx("settings", "readwrite");
  const request = store.put(data);

  request.onerror = () =>
    showAdminMessage(
      "settings-message",
      request.error?.message ?? "共通設定を保存できませんでした。",
      true
    );

  store.transaction.oncomplete = () =>
    showAdminMessage(
      "settings-message",
      "共通設定を保存しました。"
    );

  store.transaction.onabort = () =>
    showAdminMessage(
      "settings-message",
      store.transaction.error?.message ??
        "共通設定の保存処理が中断されました。",
      true
    );
}

/**
 * 管理画面のイベント、IndexedDB、利用者一覧、共通設定を初期化する。
 * @returns {Promise<void>}
 */
async function initializeAdmin() {
  bindAdminActions();
  try {
    await openDB();
    await seedIfEmpty();
    prepareDateFields();
    await Promise.all([refreshMembers(), loadAdminSettings()]);
  } catch (error) {
    console.error("管理画面の初期化に失敗しました:", error);
    showAdminMessage("admin-status", `管理画面を初期化できませんでした: ${error.message}`, true);
  }
}

initializeAdmin();
