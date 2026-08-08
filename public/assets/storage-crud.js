// ===================== データ保存: 利用者CRUD・共通設定 =====================
// 依存: pdf-core.js（$, setStatus）, storage-core.js（tx, collectFields, applyFields, MEMBER_FIELDS, SETTINGS_FIELDS）
// 読み込み順: pdf-core.js → storage-core.js → このファイル
// ---- 利用者 ----
async function loadMemberList() {
  const sel = $("memberSelect");
  const cur = sel.value;
  sel.innerHTML = '<option value="">（新規入力）</option>';
  const req = tx("members", "readonly").getAll();
  req.onsuccess = () => {
    req.result.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = m.name || ("利用者#" + m.id);
      sel.appendChild(opt);
    });
    sel.value = cur;
  };
}

async function saveMember() {
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

function loadMember(id) {
  if (!id) { $("deleteMemberBtn").disabled = true; return; }
  const req = tx("members", "readonly").get(Number(id));
  req.onsuccess = () => { if (req.result) { applyFields(req.result); $("deleteMemberBtn").disabled = false; setStatus("利用者を読み込みました", true); } };
}

async function deleteMember() {
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

// ---- 共通設定（1件） ----
function saveSettings() {
  const data = collectFields(SETTINGS_FIELDS);
  data.id = "singleton";
  const store = tx("settings", "readwrite");
  store.put(data);
  store.transaction.oncomplete = () => setStatus("共通設定を保存しました", true);
}
function loadSettings() {
  const req = tx("settings", "readonly").get("singleton");
  req.onsuccess = () => { if (req.result) applyFields(req.result); };
}
