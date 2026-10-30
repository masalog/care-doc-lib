const memberForm = $("member-form");
const settingsForm = $("settings-form");
let adminMembers = [];

function showAdminMessage(id, message, isError = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.toggle("success", !isError && Boolean(message));
}

function showSection(name, button) {
  $("section-members").classList.toggle("hidden", name !== "members");
  $("section-settings").classList.toggle("hidden", name !== "settings");
  document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
  if (button) button.classList.add("active");
}

function fillDateSelect(id, first, last) {
  const select = $(id);
  select.replaceChildren(new Option("--", ""));
  for (let value = first; value <= last; value += 1) {
    select.add(new Option(String(value), String(value)));
  }
}

function prepareDateFields() {
  const thisYear = new Date().getFullYear();
  ["m-birth-year", "m-start-year", "m-end-year", "m-inst-year"].forEach((id) =>
    fillDateSelect(id, thisYear - 120, thisYear + 2));
  ["m-birth-month", "m-start-month", "m-end-month", "m-inst-month"].forEach((id) =>
    fillDateSelect(id, 1, 12));
  ["m-birth-day", "m-start-day", "m-end-day", "m-inst-day"].forEach((id) =>
    fillDateSelect(id, 1, 31));
}

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

function getFormValues(form, fields) {
  return Object.fromEntries(fields.map((field) => [
    field,
    form.elements.namedItem(field).value.trim(),
  ]));
}

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

function hideMemberForm() {
  $("member-form-container").classList.add("hidden");
  memberForm.reset();
  $("member-id").value = "";
}

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

function loadAdminSettings() {
  return new Promise((resolve, reject) => {
    const request = tx("settings", "readonly").get("singleton");
    request.onsuccess = () => {
      if (request.result) setFormValues(settingsForm, request.result, SETTINGS_FIELDS);
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

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

async function initializeAdmin() {
  try {
    db = await openDB();
    await seedIfEmpty();
    prepareDateFields();
    await Promise.all([refreshMembers(), loadAdminSettings()]);
  } catch (error) {
    console.error("管理画面の初期化に失敗しました:", error);
    showAdminMessage("admin-status", `管理画面を初期化できませんでした: ${error.message}`, true);
  }
}

initializeAdmin();
