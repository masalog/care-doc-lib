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

function pdfValue(id) {
  const fieldId = id === "Insurance ID Number" ? "insuranceIdNumber" : id;
  const input = $(fieldId);
  if (input) return input.value.trim();
  if (Object.prototype.hasOwnProperty.call(activeMember || {}, fieldId)) {
    return String(activeMember[fieldId] ?? "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(activeSettings || {}, fieldId)) {
    return String(activeSettings[fieldId] ?? "").trim();
  }
  return "";
}

async function generate() {
  if (!layout || !templateBytes || !fontBytes) { setStatus("アセット未読込のため生成できません"); return; }
  if (!activeMember) { setStatus("利用者を選択してください"); return; }
  setStatus("生成中…");

  const pdfDoc = await PDFDocument.load(templateBytes.slice(0));
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: false });
  const page = pdfDoc.getPages()[0];

  drawText(page, font, "Insurance ID Number", pdfValue("Insurance ID Number"));
  drawText(page, font, "name", pdfValue("name"));
  drawText(page, font, "furigana", pdfValue("furigana"));
  drawText(page, font, "birthYear", pdfValue("birthYear"));
  drawText(page, font, "birthMonth", pdfValue("birthMonth"));
  drawText(page, font, "birthDay", pdfValue("birthDay"));
  drawText(page, font, "address", pdfValue("address"));
  drawText(page, font, "phone", pdfValue("phone"));

  if (pdfValue("gender") === "男") drawCircle(page, font, "genderMale");
  else if (pdfValue("gender") === "女") drawCircle(page, font, "genderFemale");

  const careKey = mapCareLevel(pdfValue("careLevel"));
  if (careKey) drawCircle(page, font, careKey);

  drawText(page, font, "startYear", pdfValue("startYear"));
  drawText(page, font, "startMonth", pdfValue("startMonth"));
  drawText(page, font, "startDay", pdfValue("startDay"));
  drawText(page, font, "endYear", pdfValue("endYear"));
  drawText(page, font, "endMonth", pdfValue("endMonth"));
  drawText(page, font, "endDay", pdfValue("endDay"));
  drawText(page, font, "institutionYear", pdfValue("institutionYear"));
  drawText(page, font, "institutionMonth", pdfValue("institutionMonth"));
  drawText(page, font, "institutionDay", pdfValue("institutionDay"));

  drawText(page, font, "Survey Location Address", pdfValue("surveyAddress"));
  drawText(page, font, "Survey Location Phone", pdfValue("surveyPhone"));
  drawText(page, font, "facilityName", pdfValue("facilityName"));
  drawText(page, font, "facilityPhone", pdfValue("facilityPhone"));
  drawText(page, font, "institutionName", pdfValue("institutionName"));
  drawText(page, font, "institutionAddress", pdfValue("institutionAddress"));
  drawText(page, font, "agentName", pdfValue("agentName"));
  drawText(page, font, "agentPostal", pdfValue("agentPostal"));
  drawText(page, font, "agentAddress", pdfValue("agentAddress"));
  drawText(page, font, "agentPhone", pdfValue("agentPhone"));
  drawText(page, font, "doctorName", pdfValue("doctorName"));
  drawText(page, font, "clinicName", pdfValue("clinicName"));
  drawText(page, font, "clinicPostal", pdfValue("clinicPostal"));
  drawText(page, font, "clinicAddress", pdfValue("clinicAddress"));
  drawText(page, font, "clinicPhone", pdfValue("clinicPhone"));

  drawCircle(page, font, "isFacility");
  drawCircle(page, font, "agentCategory");

  drawText(page, font, "applyYear", pdfValue("applyYear"));
  drawText(page, font, "applyMonth", pdfValue("applyMonth"));
  drawText(page, font, "applyDay", pdfValue("applyDay"));
  drawText(page, font, "Change Request Reason", pdfValue("changeReason"));

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
