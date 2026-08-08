// ===================== データ保存: まとめて追加（JSONファイルから追加）・ボタン登録 =====================
// 依存: pdf-core.js（$, setStatus）, storage-core.js（tx, MEMBER_FIELDS, SETTINGS_FIELDS）,
//        storage-crud.js（loadMemberList, loadSettings）, storage-export.js（IO_FORMAT, exportData）
// 読み込み順: pdf-core.js → storage-core.js → storage-crud.js → storage-export.js → このファイル
// すべて端末内で完結し、外部へは送信しません。

// 隠し input[type=file] 経由でファイルを受け取り、検証してから追加する
function triggerImport() {
  $("importFile").click();
}

async function handleImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";  // 同じファイルを続けて選べるようにリセット
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const { members, settings } = validateBackup(data);

    const msg = "このファイルから利用者 " + members.length + " 件を『追加』します。\n"
      + "（既存の利用者データはそのまま残ります）\n"
      + (settings ? "共通設定は取り込んだ内容で上書きされます。\n" : "")
      + "よろしいですか？";
    if (!confirm(msg)) { setStatus("まとめて追加を中止しました"); return; }

    await importMerge(members, settings);
    await loadMemberList();
    loadSettings();
    setStatus("まとめて追加しました（利用者" + members.length + "件を追加）", true);
  } catch (err) {
    console.error(err);
    setStatus("まとめて追加に失敗しました: " + err.message);
    alert("まとめて追加に失敗しました。\nファイル形式を確認してください。\n\n詳細: " + err.message);
  }
}

// 取り込んだ JSON の形式を検証し、正規化した members / settings を返す
function validateBackup(data) {
  if (!data || typeof data !== "object") throw new Error("JSONの中身が不正です");
  if (data.format && data.format !== IO_FORMAT) {
    throw new Error("対応していない形式です (format=" + data.format + ")");
  }
  if (!Array.isArray(data.members)) throw new Error("members 配列が見つかりません");

  // 各利用者を既知フィールドのみに整形し、id は取り除く（追加時に振り直す）
  const members = data.members.map((m) => {
    if (!m || typeof m !== "object") throw new Error("利用者データの形式が不正です");
    const o = {};
    MEMBER_FIELDS.forEach((f) => { o[f] = m[f] != null ? String(m[f]) : ""; });
    return o;
  });

  // 共通設定は任意。あれば既知フィールドのみに整形
  let settings = null;
  if (data.settings && typeof data.settings === "object") {
    settings = { id: "singleton" };
    SETTINGS_FIELDS.forEach((f) => { settings[f] = data.settings[f] != null ? String(data.settings[f]) : ""; });
  }
  return { members, settings };
}

// 利用者は id を付けずに add（自動採番）＝常に新規追加。設定があれば上書き。
function importMerge(members, settings) {
  return new Promise((resolve, reject) => {
    if (members.length === 0 && !settings) { resolve(); return; }
    if (members.length > 0) {
      const store = tx("members", "readwrite");
      members.forEach((m) => store.add(m));  // id を持たせない → autoIncrement で新規採番
      store.transaction.oncomplete = () => {
        if (settings) putSettings(settings).then(resolve).catch(reject);
        else resolve();
      };
      store.transaction.onerror = () => reject(store.transaction.error);
    } else {
      putSettings(settings).then(resolve).catch(reject);
    }
  });
}

function putSettings(settings) {
  return new Promise((resolve, reject) => {
    const store = tx("settings", "readwrite");
    store.put(settings);
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

// ボタン・ファイル入力のイベント登録（まとめて保存・まとめて追加の両方）
function initIO() {
  $("exportBtn").addEventListener("click", exportData);
  $("importBtn").addEventListener("click", triggerImport);
  $("importFile").addEventListener("change", handleImportFile);
}
