// ===================== PDF描画ヘルパー・生成 =====================
// 依存: pdf-core.js（$, setStatus, v, layout, templateBytes, fontBytes, PDFDocument, rgb, lastPdfBytes, lastUrl 等を共有）
// 読み込み順: pdf-core.js の後にすること
function drawText(page, font, key, value) {
  if (value == null || value === "") return;
  const pos = layout.fields[key];
  if (!pos) return;
  String(value).split("\n").forEach((line, i) => {
    if (line === "") return;
    page.drawText(line, { x: pos.x, y: pos.y - i * (pos.fontSize + 2), size: pos.fontSize, font, color: rgb(0,0,0) });
  });
}
function drawCircle(page, font, key) {
  const pos = layout.fields[key];
  if (!pos) return;
  page.drawText("〇", { x: pos.x, y: pos.y, size: pos.fontSize, font });
}
function mapCareLevel(c) {
  return ({ "要介護1":"Long-term Care Level 1","要介護2":"Long-term Care Level 2","要介護3":"Long-term Care Level 3",
    "要介護4":"Long-term Care Level 4","要介護5":"Long-term Care Level 5","要支援1":"Support Level 1","要支援2":"Support Level 2" })[c] || null;
}

async function generate() {
  if (!layout || !templateBytes || !fontBytes) { setStatus("アセット未読込のため生成できません"); return; }
  setStatus("生成中…");

  const pdfDoc = await PDFDocument.load(templateBytes.slice(0));
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: false });
  const page = pdfDoc.getPages()[0];

  drawText(page, font, "Insurance ID Number", v("insuranceIdNumber"));
  drawText(page, font, "name", v("name"));
  drawText(page, font, "furigana", v("furigana"));
  drawText(page, font, "birthYear", v("birthYear"));
  drawText(page, font, "birthMonth", v("birthMonth"));
  drawText(page, font, "birthDay", v("birthDay"));
  drawText(page, font, "address", v("address"));
  drawText(page, font, "phone", v("phone"));

  if (v("gender") === "男") drawCircle(page, font, "genderMale");
  else if (v("gender") === "女") drawCircle(page, font, "genderFemale");

  const careKey = mapCareLevel(v("careLevel"));
  if (careKey) drawCircle(page, font, careKey);

  drawText(page, font, "startYear", v("startYear"));
  drawText(page, font, "startMonth", v("startMonth"));
  drawText(page, font, "startDay", v("startDay"));
  drawText(page, font, "endYear", v("endYear"));
  drawText(page, font, "endMonth", v("endMonth"));
  drawText(page, font, "endDay", v("endDay"));
  drawText(page, font, "institutionYear", v("institutionYear"));
  drawText(page, font, "institutionMonth", v("institutionMonth"));
  drawText(page, font, "institutionDay", v("institutionDay"));

  drawText(page, font, "Survey Location Address", v("surveyAddress"));
  drawText(page, font, "Survey Location Phone", v("surveyPhone"));
  drawText(page, font, "facilityName", v("facilityName"));
  drawText(page, font, "facilityPhone", v("facilityPhone"));
  drawText(page, font, "institutionName", v("institutionName"));
  drawText(page, font, "institutionAddress", v("institutionAddress"));
  drawText(page, font, "agentName", v("agentName"));
  drawText(page, font, "agentPostal", v("agentPostal"));
  drawText(page, font, "agentAddress", v("agentAddress"));
  drawText(page, font, "agentPhone", v("agentPhone"));
  drawText(page, font, "doctorName", v("doctorName"));
  drawText(page, font, "clinicName", v("clinicName"));
  drawText(page, font, "clinicPostal", v("clinicPostal"));
  drawText(page, font, "clinicAddress", v("clinicAddress"));
  drawText(page, font, "clinicPhone", v("clinicPhone"));

  drawCircle(page, font, "isFacility");
  drawCircle(page, font, "agentCategory");

  drawText(page, font, "applyYear", v("applyYear"));
  drawText(page, font, "applyMonth", v("applyMonth"));
  drawText(page, font, "applyDay", v("applyDay"));
  drawText(page, font, "Change Request Reason", v("changeReason"));

  lastPdfBytes = await pdfDoc.save();
  const blob = new Blob([lastPdfBytes], { type: "application/pdf" });
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastUrl = URL.createObjectURL(blob);
  const ph = $("previewPlaceholder");
  if (ph) ph.style.display = "none";
  $("previewFrame").classList.remove("is-hidden");
  $("previewFrame").src = lastUrl;
  $("previewBar").style.display = "block";
  $("dlBtn").disabled = false;
  setStatus("生成しました（データは外部送信していません）", true);
}
