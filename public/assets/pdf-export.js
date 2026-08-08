// ===================== PDFファイル名生成・ダウンロード・ボタン登録 =====================
// 依存: pdf-core.js（$, setStatus, showBanner, v, lastPdfBytes, lastUrl）, pdf-draw.js（generate）
// 読み込み順: pdf-core.js → pdf-draw.js → このファイル
function buildFileName() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateStr = `${y}年${Number(m)}月${Number(d)}日`;
  // 氏名の前後空白を除去し、名前中の空白は詰める。入力があれば「様」を付ける（未入力なら「無名」）
  const raw = v("name").replace(/\s+/g, "");
  const name = raw ? raw + "様" : "無名";
  return `${dateStr}_${name}_介護認定申請書.pdf`;
}

function download() {
  if (!lastPdfBytes) return;
  const blob = new Blob([lastPdfBytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = buildFileName();
  a.click();
}

$("genBtn").addEventListener("click", () => generate().catch(e => {
  console.error(e); setStatus("エラー: " + e.message);
  showBanner("PDF生成エラー: " + e.message);
}));
$("dlBtn").addEventListener("click", download);
$("openTabBtn").addEventListener("click", () => { if (lastUrl) window.open(lastUrl, "_blank"); });
