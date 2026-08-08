// ===================== 初期データ（SEED）・起動・イベント登録 =====================
// 依存: pdf-core.js（$, setStatus）, storage-db.js（db, tx, openDB, loadMemberList, loadSettings,
//        loadMember, saveMember, deleteMember, saveSettings）
// 読み込み順: pdf-core.js → storage-db.js → このファイル
// CareDocWeb の DataInitializer と同じ初期データ（初回起動時のみ投入）
const SEED_MEMBERS = [
  {"insuranceIdNumber":"1310204536","name":"田中 一郎","furigana":"タナカ イチロウ","birthYear":"1943","birthMonth":"2","birthDay":"15","gender":"男","address":"東京都中央区青葉町 3-5-7","phone":"020-9123-4567","careLevel":"要支援2","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"7","institutionDay":"1"},
  {"insuranceIdNumber":"1310347811","name":"佐藤 徹子","furigana":"サトウ テツコ","birthYear":"1936","birthMonth":"12","birthDay":"30","gender":"女","address":"東京都中央区南風町 5-3-6","phone":"020-7890-1123","careLevel":"要介護2","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"7","institutionDay":"20"},
  {"insuranceIdNumber":"1310981267","name":"本村 和子","furigana":"モトムラ トモコ","birthYear":"1938","birthMonth":"11","birthDay":"10","gender":"女","address":"東京都中央区東通り 1-2-3","phone":"020-2345-6798","careLevel":"要支援1","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"10","institutionDay":"1"},
  {"insuranceIdNumber":"1310893450","name":"小林 正雄","furigana":"コバヤシ マサオ","birthYear":"1939","birthMonth":"9","birthDay":"18","gender":"男","address":"東京都中央区北通り 7-2-4","phone":"020-9987-3344","careLevel":"要介護4","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"6","institutionDay":"25"},
  {"insuranceIdNumber":"1310675129","name":"松本 健太","furigana":"マツモト ケンタ","birthYear":"1940","birthMonth":"7","birthDay":"5","gender":"男","address":"東京都中央区緑ヶ丘 2-1-9","phone":"020-6678-2345","careLevel":"要介護1","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"8","institutionDay":"1"},
  {"insuranceIdNumber":"1310458923","name":"鈴木 美智子","furigana":"スズキ ミチコ","birthYear":"1945","birthMonth":"3","birthDay":"22","gender":"女","address":"東京都中央区桜町 4-8-2","phone":"020-5567-8912","careLevel":"要介護3","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"9","institutionDay":"15"},
  {"insuranceIdNumber":"1310123498","name":"中川 由紀","furigana":"ナカガワ ユキ","birthYear":"1937","birthMonth":"1","birthDay":"12","gender":"女","address":"東京都中央区白樺町 1-9-3","phone":"020-4456-7789","careLevel":"要介護5","startYear":"2025","startMonth":"6","startDay":"1","endYear":"2026","endMonth":"5","endDay":"31","institutionYear":"2025","institutionMonth":"10","institutionDay":"10"},
];
const SEED_SETTINGS = {
  id:"singleton",
  surveyAddress:"東京都中央区高浜橋1-3-9 新町センタービル3F", surveyPhone:"020-0910-7703",
  facilityName:"高浜橋なごみケアホーム", facilityPhone:"020-0910-7703",
  institutionName:"すこやかメディカルセンター", institutionAddress:"東京都中央区東光川5-6-3",
  agentName:"山田 太郎", agentPostal:"104-8721", agentAddress:"東京都中央区高浜橋1-3-9 新町センタービル3F", agentPhone:"020-0910-7703",
  doctorName:"井上 直樹", clinicName:"すこやかメディカルセンター", clinicPostal:"104-8739", clinicAddress:"東京都中央区東光川5-6-3", clinicPhone:"020-0802-8647",
};

function seedIfEmpty() {
  return new Promise((resolve) => {
    const req = tx("members", "readonly").count();
    req.onsuccess = () => {
      if (req.result > 0) { resolve(false); return; }
      const store = tx("members", "readwrite");
      SEED_MEMBERS.forEach(m => store.add(m));
      store.transaction.oncomplete = () => {
        const sset = tx("settings", "readwrite");
        sset.put(SEED_SETTINGS);
        sset.transaction.oncomplete = () => resolve(true);
      };
    };
    req.onerror = () => resolve(false);
  });
}

async function initStorage() {
  try {
    db = await openDB();
    await seedIfEmpty();   // 初回のみ CareDocWeb と同じ初期データを投入
    await loadMemberList();
    loadSettings();  // 起動時に共通設定を自動復元
    $("memberSelect").addEventListener("change", (e) => loadMember(e.target.value));
    $("saveMemberBtn").addEventListener("click", saveMember);
    $("deleteMemberBtn").addEventListener("click", deleteMember);
    $("saveSettingsBtn").addEventListener("click", saveSettings);
    initIO();  // JSONインポート/エクスポートのボタン登録
  } catch (e) {
    console.warn("IndexedDB初期化失敗:", e);
    setStatus("データ保存機能が使えません: " + e.message);
  }
}
