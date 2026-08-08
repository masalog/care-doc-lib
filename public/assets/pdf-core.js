// ===================== 共通ヘルパー・共有変数・アセット読込 =====================
// 依存: pdf-lib.min.js (PDFLib), fontkit.umd.min.js (fontkit)
// ここで宣言する変数・関数は pdf-render.js / storage-*.js / main.js から共有される
// （普通のスクリプト読み込み・読み込み順に注意: このファイルが最初）
const { PDFDocument, rgb } = PDFLib;

let templateBytes = null, fontBytes = null, layout = null, lastPdfBytes = null, lastUrl = null;

const $ = (id) => document.getElementById(id);
const setStatus = (msg, ok=false) => { const s=$("status"); s.textContent=msg; s.style.color = ok ? "var(--ok)" : "var(--muted)"; };
function showBanner(msg) { const b=$("banner"); b.textContent=msg; b.style.display="block"; }
const v = (id) => $(id).value.trim();

async function tryFetch(url, asJson=false) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + " が読み込めません (" + res.status + ")");
  return asJson ? await res.json() : new Uint8Array(await res.arrayBuffer());
}

async function bootstrap() {
  if (typeof PDFLib === "undefined") { showBanner("PDFライブラリが読み込めていません。pdf-lib.min.js の配置を確認してください。"); return; }
  try {
    layout = await tryFetch("data/positions.json", true);
    templateBytes = await tryFetch("data/template.pdf");
    fontBytes = await tryFetch("data/NotoSansJP-Regular.ttf");
    const n = Object.keys(layout.fields).length;
    $("assets").textContent = "座標:OK(" + n + ") / テンプレ:OK / フォント:OK";
    setStatus("準備完了。『PDFを生成してプレビュー』を押してください", true);
  } catch (e) {
    $("assets").textContent = "アセット読込エラー";
    showBanner("アセット読込エラー: " + e.message + " — ローカルサーバー経由で開いてください（file:// では動きません）。");
  }
}
