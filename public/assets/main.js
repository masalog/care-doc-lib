// PDF画面だけでPDFアセットを読み込み、利用者DBは両画面で共有する。
if ($("assets")) {
  const today = new Date();
  $("applyYear").value = today.getFullYear();
  $("applyMonth").value = today.getMonth() + 1;
  $("applyDay").value = today.getDate();
  bootstrap();
}
if ($("memberSelect")) initStorage();
