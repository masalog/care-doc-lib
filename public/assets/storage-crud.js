// ===================== データ保存: 利用者CRUD・共通設定 =====================
// 依存: pdf-core.js（$, setStatus）, storage-core.js（tx, collectFields, applyFields, MEMBER_FIELDS, SETTINGS_FIELDS）
// 読み込み順: pdf-core.js → storage-core.js → このファイル
// ---- 利用者 ----

let settingsLoaded = false;
let memberLoadSequence = 0;
let memberGeneration = 0;

async function loadMemberList() {
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

function loadMember(id) {
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

function resetPdfState() {
  lastPdfBytes = null;

  if (lastUrl) {
    URL.revokeObjectURL(lastUrl);
    lastUrl = null;
  }

  const preview = $("previewFrame");
  if (preview) {
    preview.src = "";
    preview.classList.add("is-hidden");
  }

  const placeholder = $("previewPlaceholder");
  if (placeholder) {
    placeholder.style.display = "block";
  }

  const downloadBtn = $("dlBtn");
  if (downloadBtn) {
    downloadBtn.disabled = true;
  }

  const previewBar = $("previewBar");
  if (previewBar) {
    previewBar.style.display = "none";
  }
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
  store.transaction.oncomplete = () => {
    activeSettings = data;
    setStatus("共通設定を保存しました", true);
  };
}

function loadSettings() {
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
