// ===================== データ保存: まとめて保存（全データをJSONファイルへ） =====================
// 依存: pdf-core.js（$, setStatus）, storage-core.js（db）
// 読み込み順: pdf-core.js → storage-core.js → このファイル → storage-import.js
// すべて端末内で完結し、外部へは送信しません。
const IO_FORMAT = "caredoc-backup";
const IO_VERSION = 1;

// 全利用者 + 共通設定を 1 つの JSON にまとめてダウンロードする
async function exportData() {
  try {
    // members と settings を 1 つのトランザクションでまとめて読む。
    // （別々の tx() を await を挟んで開くと接続が閉じかけと判定され
    //   "The database connection is closing" エラーになるため）
    const { members, settings } = await new Promise((resolve, reject) => {
      const t = db.transaction(["members", "settings"], "readonly");
      const out = { members: [], settings: null };
      t.objectStore("members").getAll().onsuccess = (ev) => { out.members = ev.target.result || []; };
      t.objectStore("settings").get("singleton").onsuccess = (ev) => { out.settings = ev.target.result || null; };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("トランザクションが中断されました"));
    });

    const payload = {
      format: IO_FORMAT,
      version: IO_VERSION,
      exportedAt: new Date().toISOString(),
      members,
      settings,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = buildBackupFileName();
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("まとめて保存しました（利用者" + members.length + "件・データは外部送信していません）", true);
  } catch (e) {
    console.error(e);
    setStatus("まとめて保存に失敗しました: " + e.message);
  }
}

function buildBackupFileName() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
  return `caredoc_backup_${dateStr}.json`;
}
