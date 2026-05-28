const STORAGE_KEY = "oficina_orcamentos_v3";
const VEHICLE_MEMORY_KEY = "oficina_placas_salvas_v1";

const OFFICE = {
  nome: "Oficina Modelo",
  telefone: "(11) 99999-0000",
  endereco: "Rua da Oficina, 123",
};

const views = [...document.querySelectorAll(".view")];
const screenTitle = document.querySelector("#screenTitle");
const budgetList = document.querySelector("#budgetList");
const emptyState = document.querySelector("#emptyState");
const budgetCount = document.querySelector("#budgetCount");
const newBudgetButton = document.querySelector("#newBudgetButton");
const searchButton = document.querySelector("#searchButton");
const searchPanel = document.querySelector("#searchPanel");
const searchInput = document.querySelector("#searchInput");
const menuButton = document.querySelector("#menuButton");
const closeMenuButton = document.querySelector("#closeMenuButton");
const drawer = document.querySelector("#drawer");
const overlay = document.querySelector("#overlay");
const installButton = document.querySelector("#installButton");
const cameraPreview = document.querySelector("#cameraPreview");
const cameraStatus = document.querySelector("#cameraStatus");
const budgetTextInput = document.querySelector("#budgetTextInput");
const parsedPreview = document.querySelector("#parsedPreview");

let budgets = loadBudgets();
let vehicleMemory = loadVehicleMemory();
let draft = createDraft();
let currentClientStep = 0;
let cameraStream = null;
let deferredInstallPrompt = null;

const clientSteps = [
  { key: "nome", title: "Nome do cliente", label: "Nome", type: "text", placeholder: "João Silva" },
  { key: "telefone", title: "Telefone", label: "WhatsApp", type: "tel", placeholder: "DDD + número" },
  { key: "email", title: "Email opcional", label: "Email", type: "email", placeholder: "cliente@email.com" },
];

const vehicleMock = {
  ABC1D23: { placa: "ABC1D23", modelo: "Volkswagen Gol 1.0", ano: "2020", cor: "Prata" },
  ABC1234: { placa: "ABC1234", modelo: "Fiat Uno Mille", ano: "2012", cor: "Branco" },
  BRA2E19: { placa: "BRA2E19", modelo: "Chevrolet Onix LT", ano: "2021", cor: "Preto" },
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function money(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function todayText() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizePlate(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function isValidPlate(plate) {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
}

function createDraft() {
  return {
    os: nextOsNumber(),
    data: todayText(),
    criadoEm: nowIso(),
    atualizadoEm: nowIso(),
    status: "pendente",
    cliente: { nome: "", telefone: "", email: "" },
    veiculo: { placa: "", modelo: "", ano: "", cor: "" },
    itens: [],
    descontoPercentual: 0,
    descontoValor: 0,
    subtotal: 0,
    desconto: 0,
    total: 0,
    anexos: [],
    observacoes: "",
  };
}

function loadBudgets() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.map(normalizeBudget);
  } catch {
    return [];
  }

  // Migração simples da versão antiga, caso exista.
  try {
    const old = JSON.parse(localStorage.getItem("oficina_orcamentos_v2"));
    if (Array.isArray(old)) {
      const migrated = old.map(normalizeBudget);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    return [];
  }

  return [];
}

function normalizeBudget(budget) {
  return {
    ...budget,
    data: budget.data || todayText(),
    criadoEm: budget.criadoEm || nowIso(),
    atualizadoEm: budget.atualizadoEm || budget.criadoEm || nowIso(),
    status: budget.status || "pendente",
    anexos: Array.isArray(budget.anexos) ? budget.anexos : [],
    observacoes: budget.observacoes || "",
  };
}

function saveBudgets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
}

function loadVehicleMemory() {
  try {
    const saved = JSON.parse(localStorage.getItem(VEHICLE_MEMORY_KEY));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) return saved;
  } catch {
    return {};
  }
  return {};
}

function saveVehicleMemory() {
  localStorage.setItem(VEHICLE_MEMORY_KEY, JSON.stringify(vehicleMemory));
}

function rememberVehicle(vehicle) {
  const placa = normalizePlate(vehicle.placa);
  if (!isValidPlate(placa)) return;
  vehicleMemory[placa] = {
    placa,
    modelo: vehicle.modelo || "",
    ano: vehicle.ano || "",
    cor: vehicle.cor || "",
  };
  saveVehicleMemory();
}

function nextOsNumber() {
  const saved = loadBudgets();
  return saved.reduce((highest, budget) => Math.max(highest, Number(budget.os) || 0), 0) + 1;
}

function showView(id) {
  views.forEach((view) => view.classList.toggle("active", view.id === id));
  const titles = {
    homeView: "Orçamentos",
    plateView: "Ler placa",
    manualPlateView: "Placa",
    vehicleView: "Veículo",
    clientView: "Cliente",
    budgetTextView: "Orçamento",
    detailView: "Resumo",
  };
  screenTitle.textContent = titles[id] || "Orçamentos";
  newBudgetButton.hidden = id !== "homeView";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = budgets.filter((budget) => {
    const text = `${budget.os} ${budget.cliente.nome} ${budget.veiculo.placa} ${budget.status} ${budget.data}`.toLowerCase();
    return text.includes(term);
  });

  budgetCount.textContent = budgets.length;
  emptyState.hidden = filtered.length > 0;

  budgetList.innerHTML = filtered
    .map((budget) => `
      <button class="budget-card" data-os="${budget.os}">
        <span>
          <strong>O.S #${budget.os} - ${escapeHtml(budget.cliente.nome || "Cliente")}</strong>
          <span>Data: ${escapeHtml(budget.data)} • Placa: ${escapeHtml(budget.veiculo.placa || "Sem placa")}</span>
          <span>${escapeHtml(budget.veiculo.modelo || "Veículo não informado")}</span>
          <span class="status-pill status-${budget.status}">${statusLabel(budget.status)}</span>
        </span>
        <span class="budget-total">${money(budget.total)}</span>
      </button>
    `)
    .join("");

  budgetList.querySelectorAll(".budget-card").forEach((button) => {
    button.addEventListener("click", () => {
      const budget = budgets.find((item) => String(item.os) === String(button.dataset.os));
      if (budget) {
        renderDetail(budget);
        showView("detailView");
      }
    });
  });
}

function statusLabel(status) {
  const labels = {
    pendente: "Pendente de aceite",
    aprovado: "Aprovado - pode iniciar",
    reprovado: "Reprovado",
  };
  return labels[status] || status;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function startNewBudget() {
  draft = createDraft();
  currentClientStep = 0;
  budgetTextInput.value = "";
  parsedPreview.innerHTML = "";
  showView("plateView");
  await startCamera();
}

async function startCamera() {
  stopCamera();
  cameraStatus.textContent = "Abrindo câmera traseira...";
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Câmera indisponível. Toque em Manual.";
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    cameraPreview.srcObject = cameraStream;
    cameraStatus.textContent = "Enquadre a placa e toque em Capturar.";
  } catch {
    cameraStatus.textContent = "Não foi possível abrir a câmera. Toque em Manual.";
  }
}

function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
}

function simulatePlateRead() {
  const plates = Object.keys(vehicleMock);
  return plates[Math.floor(Math.random() * plates.length)];
}

async function handlePlate(plate) {
  const cleanPlate = normalizePlate(plate);
  if (!isValidPlate(cleanPlate)) {
    alert("Digite uma placa válida. Exemplos: ABC1234 ou ABC1D23.");
    return;
  }
  stopCamera();
  draft.veiculo = await consultarDadosVeiculo(cleanPlate);
  fillVehicleForm();
  showView("vehicleView");
}

async function consultarDadosVeiculo(placa) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (vehicleMemory[placa]) return { ...vehicleMemory[placa] };
  return vehicleMock[placa] || { placa, modelo: "Modelo não encontrado", ano: "", cor: "" };
}

function fillVehicleForm() {
  document.querySelector("#vehiclePlate").value = draft.veiculo.placa;
  document.querySelector("#vehicleModel").value = draft.veiculo.modelo;
  document.querySelector("#vehicleYear").value = draft.veiculo.ano;
  document.querySelector("#vehicleColor").value = draft.veiculo.cor;
}

function readVehicleForm() {
  draft.veiculo = {
    placa: normalizePlate(document.querySelector("#vehiclePlate").value),
    modelo: document.querySelector("#vehicleModel").value.trim(),
    ano: document.querySelector("#vehicleYear").value.trim(),
    cor: document.querySelector("#vehicleColor").value.trim(),
  };
}

function renderClientStep() {
  const step = clientSteps[currentClientStep];
  const input = document.querySelector("#clientStepInput");
  document.querySelector("#clientStepLabel").textContent = `Passo 3 de 4 - ${currentClientStep + 1}/3`;
  document.querySelector("#clientStepTitle").textContent = step.title;
  document.querySelector("#clientFieldLabel").firstChild.textContent = step.label;
  input.type = step.type;
  input.placeholder = step.placeholder;
  input.value = draft.cliente[step.key] || "";
  document.querySelector("#clientNextButton").textContent = currentClientStep === clientSteps.length - 1 ? "Continuar" : "Próximo";
  showView("clientView");
  setTimeout(() => input.focus(), 120);
}

function saveClientStep() {
  const step = clientSteps[currentClientStep];
  const input = document.querySelector("#clientStepInput");
  const value = input.value.trim();

  if (step.key !== "email" && !value) {
    alert("Preencha este campo para continuar.");
    input.focus();
    return false;
  }

  draft.cliente[step.key] = value;
  return true;
}

function parseBudgetText(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const items = [];
  let discountPercent = 0;
  let discountValue = 0;

  lines.forEach((line) => {
    const discountPercentMatch = line.match(/^(?:aplica\s+)?desconto\b.*?(\d+(?:[,.]\d+)?)\s*%/i);
    if (discountPercentMatch) {
      const parsedPercent = Number(discountPercentMatch[1].replace(",", ".")) || 0;
      discountPercent = Math.min(Math.max(parsedPercent, 0), 100);
      return;
    }

    const discountValueMatch = line.match(/^(?:aplica\s+)?desconto\b.*?(?:r\$\s*)?(\d+(?:[,.]\d{1,2})?)\s*(?:reais|real)?$/i);
    if (discountValueMatch) {
      const parsedValue = Number(discountValueMatch[1].replace(",", ".")) || 0;
      discountValue += Math.max(parsedValue, 0);
      return;
    }

    const valueMatch = line.match(/(?:r\$\s*)?(\d+(?:[,.]\d{1,2})?)\s*(?:reais|real)?$/i);
    if (!valueMatch) return;

    const value = Number(valueMatch[1].replace(",", ".")) || 0;
    const description = line.replace(valueMatch[0], "").replace(/\s*-\s*$/, "").trim();

    if (description && value > 0) items.push({ descricao: description, valor: value });
  });

  const subtotal = items.reduce((sum, item) => sum + item.valor, 0);
  const percentDiscountValue = subtotal * (discountPercent / 100);
  const desconto = Math.min(percentDiscountValue + discountValue, subtotal);
  const total = Math.max(subtotal - desconto, 0);

  return { items, discountPercent, discountValue, subtotal, desconto, total };
}

function discountLabel(percent, value) {
  const parts = [];
  if (percent) parts.push(`${percent}%`);
  if (value) parts.push(money(value));
  return parts.length ? `Desconto (${parts.join(" + ")})` : "Desconto";
}

function renderParsedPreview() {
  const parsed = parseBudgetText(budgetTextInput.value);
  parsedPreview.innerHTML = `
    ${parsed.items.map((item) => `
      <div class="parsed-line"><span>${escapeHtml(item.descricao)}</span><strong>${money(item.valor)}</strong></div>
    `).join("") || "<p>Nenhum item identificado ainda.</p>"}
    <div class="parsed-line"><span>Subtotal</span><strong>${money(parsed.subtotal)}</strong></div>
    <div class="parsed-line"><span>${discountLabel(parsed.discountPercent, parsed.discountValue)}</span><strong>${money(parsed.desconto)}</strong></div>
    <div class="parsed-line total-row"><span>Total</span><strong>${money(parsed.total)}</strong></div>
  `;
}

function finishBudget() {
  const parsed = parseBudgetText(budgetTextInput.value);
  if (!parsed.items.length) {
    alert("Informe pelo menos um item com valor.");
    budgetTextInput.focus();
    return;
  }

  draft.itens = parsed.items;
  draft.descontoPercentual = parsed.discountPercent;
  draft.descontoValor = parsed.discountValue;
  draft.subtotal = parsed.subtotal;
  draft.desconto = parsed.desconto;
  draft.total = parsed.total;
  draft.atualizadoEm = nowIso();

  const existingIndex = budgets.findIndex((budget) => budget.os === draft.os);
  if (existingIndex >= 0) {
    budgets[existingIndex] = structuredClone(draft);
  } else {
    budgets.unshift(structuredClone(draft));
  }

  saveBudgets();
  renderHome();
  renderDetail(draft);
  showView("detailView");
}

function renderDetail(budget) {
  const acceptLink = buildApprovalLink(budget.os, "aprovar");
  const rejectLink = buildApprovalLink(budget.os, "reprovar");

  document.querySelector("#detailCard").innerHTML = `
    <div class="detail-head">
      <div>
        <p class="step-label">Orçamento ${statusLabel(budget.status)}</p>
        <h2>O.S #${budget.os}</h2>
        <p>Data: ${escapeHtml(budget.data)}</p>
      </div>
      <strong>${money(budget.total)}</strong>
    </div>

    <div class="detail-section">
      <h3>Status</h3>
      <span class="status-pill status-${budget.status}">${statusLabel(budget.status)}</span>
      <div class="button-row">
        <button id="approveButton" class="primary-button">Marcar aprovado</button>
        <button id="rejectButton" class="danger-button">Marcar reprovado</button>
      </div>
    </div>

    <div class="detail-section">
      <h3>Cliente</h3>
      <p>${escapeHtml(budget.cliente.nome)}</p>
      <p>${escapeHtml(budget.cliente.telefone)}</p>
      <p>${escapeHtml(budget.cliente.email || "Email não informado")}</p>
    </div>

    <div class="detail-section">
      <h3>Veículo</h3>
      <p>${escapeHtml(budget.veiculo.placa)} - ${escapeHtml(budget.veiculo.modelo)}</p>
      <p>${escapeHtml(budget.veiculo.ano || "Ano não informado")} - ${escapeHtml(budget.veiculo.cor || "Cor não informada")}</p>
    </div>

    <div class="detail-section">
      <h3>Itens</h3>
      ${budget.itens.map((item) => `
        <div class="detail-line"><span>${escapeHtml(item.descricao)}</span><strong>${money(item.valor)}</strong></div>
      `).join("")}
      <div class="detail-line"><span>Subtotal</span><strong>${money(budget.subtotal)}</strong></div>
      <div class="detail-line"><span>${discountLabel(budget.descontoPercentual, budget.descontoValor)}</span><strong>${money(budget.desconto)}</strong></div>
      <div class="detail-line total-row"><span>Valor final</span><strong>${money(budget.total)}</strong></div>
    </div>

    <div class="detail-section">
      <h3>Fotos e arquivos da O.S</h3>
      <input id="attachmentInput" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
      <div id="attachmentList">${renderAttachments(budget)}</div>
    </div>

    <div class="detail-section accept-box">
      <h3>Link de aceite</h3>
      <p>Use estes links no PDF ou envie para o cliente aprovar/reprovar.</p>
      <p><strong>Aprovar:</strong></p>
      <p class="link-text">${escapeHtml(acceptLink)}</p>
      <p><strong>Reprovar:</strong></p>
      <p class="link-text">${escapeHtml(rejectLink)}</p>
    </div>

    <div class="button-row">
      <button id="editButton" class="secondary-button">Alterar orçamento</button>
      <button id="pdfButton" class="primary-button">Gerar PDF</button>
      <button id="whatsButton" class="secondary-button">WhatsApp</button>
      <button id="emailButton" class="secondary-button">Email</button>
      <button id="homeButton" class="secondary-button">Voltar ao início</button>
    </div>
  `;

  document.querySelector("#approveButton").addEventListener("click", () => updateBudgetStatus(budget.os, "aprovado"));
  document.querySelector("#rejectButton").addEventListener("click", () => updateBudgetStatus(budget.os, "reprovado"));
  document.querySelector("#editButton").addEventListener("click", () => editBudget(budget.os));
  document.querySelector("#pdfButton").addEventListener("click", () => generatePdf(budget));
  document.querySelector("#whatsButton").addEventListener("click", () => shareWhatsApp(budget));
  document.querySelector("#emailButton").addEventListener("click", () => shareEmail(budget));
  document.querySelector("#homeButton").addEventListener("click", () => showView("homeView"));
  document.querySelector("#attachmentInput").addEventListener("change", (event) => addAttachments(budget.os, event.target.files));
}

function renderAttachments(budget) {
  if (!budget.anexos?.length) return `<p class="status-text">Nenhuma foto ou arquivo adicionado ainda.</p>`;

  const photos = budget.anexos.filter((file) => file.type.startsWith("image/"));
  const docs = budget.anexos.filter((file) => !file.type.startsWith("image/"));

  return `
    ${photos.length ? `<div class="photo-grid">${photos.map((file) => `
      <div class="photo-card">
        <img src="${file.dataUrl}" alt="${escapeHtml(file.name)}" />
        <small>${escapeHtml(file.name)}</small>
        <button class="danger-button" onclick="removeAttachment(${budget.os}, '${file.id}')">Remover</button>
      </div>
    `).join("")}</div>` : ""}
    ${docs.map((file) => `
      <div class="file-card">
        <a href="${file.dataUrl}" download="${escapeHtml(file.name)}">${escapeHtml(file.name)}</a>
        <button class="danger-button" onclick="removeAttachment(${budget.os}, '${file.id}')">Remover</button>
      </div>
    `).join("")}
  `;
}

async function addAttachments(os, files) {
  const budget = budgets.find((item) => item.os === os);
  if (!budget || !files?.length) return;

  for (const file of files) {
    const dataUrl = await fileToDataUrl(file);
    budget.anexos.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl,
      createdAt: nowIso(),
    });
  }

  budget.atualizadoEm = nowIso();
  saveBudgets();
  renderDetail(budget);
}

function removeAttachment(os, attachmentId) {
  const budget = budgets.find((item) => item.os === os);
  if (!budget) return;
  budget.anexos = budget.anexos.filter((file) => file.id !== attachmentId);
  budget.atualizadoEm = nowIso();
  saveBudgets();
  renderDetail(budget);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function editBudget(os) {
  const budget = budgets.find((item) => item.os === os);
  if (!budget) return;

  draft = structuredClone(budget);
  currentClientStep = 0;

  fillVehicleForm();
  budgetTextInput.value = budget.itens.map((item) => `${item.descricao} - ${String(item.valor).replace(".", ",")} reais`).join("\n");

  if (budget.descontoPercentual) {
    budgetTextInput.value += `\naplica desconto de ${budget.descontoPercentual}%`;
  }

  if (budget.descontoValor) {
    budgetTextInput.value += `\ndesconto ${String(budget.descontoValor).replace(".", ",")} reais`;
  }

  renderClientStep();
}

function updateBudgetStatus(os, status) {
  const budget = budgets.find((item) => item.os === Number(os));
  if (!budget) return false;

  budget.status = status;
  budget.atualizadoEm = nowIso();
  saveBudgets();
  renderHome();
  renderDetail(budget);
  return true;
}

function buildApprovalLink(os, action) {
  const url = new URL(window.location.href);
  url.searchParams.set("os", os);
  url.searchParams.set("acao", action);
  return url.toString();
}

function checkApprovalFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const os = Number(params.get("os"));
  const action = params.get("acao");

  if (!os || !action) return;

  const status = action === "aprovar" ? "aprovado" : action === "reprovar" ? "reprovado" : "";
  if (!status) return;

  const ok = updateBudgetStatus(os, status);
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = "";
  history.replaceState({}, "", cleanUrl.toString());

  if (ok) {
    alert(`O.S #${os} marcada como ${statusLabel(status)}.`);
  } else {
    alert(`Não encontrei a O.S #${os} neste aparelho. Para funcionar 100%, use nuvem/Firebase.`);
  }
}

function buildMessage(budget) {
  return `Olá, ${budget.cliente.nome}! Segue o orçamento:

O.S #${budget.os}
Data: ${budget.data}
Status: ${statusLabel(budget.status)}

Veículo: ${budget.veiculo.placa} - ${budget.veiculo.modelo}

${budget.itens.map((item) => `- ${item.descricao}: ${money(item.valor)}`).join("\n")}

Subtotal: ${money(budget.subtotal)}
${discountLabel(budget.descontoPercentual, budget.descontoValor)}: ${money(budget.desconto)}
Total: ${money(budget.total)}

Link para aprovar:
${buildApprovalLink(budget.os, "aprovar")}

Link para reprovar:
${buildApprovalLink(budget.os, "reprovar")}

${OFFICE.nome}
${OFFICE.telefone}`;
}

function shareWhatsApp(budget) {
  const phone = onlyDigits(budget.cliente.telefone);
  const to = phone.length >= 10 ? `55${phone.startsWith("55") ? phone.slice(2) : phone}` : "";
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(buildMessage(budget))}`, "_blank", "noopener");
}

function shareEmail(budget) {
  const subject = encodeURIComponent(`Orçamento O.S #${budget.os}`);
  const body = encodeURIComponent(buildMessage(budget));
  window.location.href = `mailto:${budget.cliente.email || ""}?subject=${subject}&body=${body}`;
}

function generatePdf(budget) {
  const rows = budget.itens.map((item) => `
    <tr>
      <td>${escapeHtml(item.descricao).toUpperCase()}</td>
      <td>${money(item.valor)}</td>
    </tr>
  `).join("");

  const photos = (budget.anexos || [])
    .filter((file) => file.type.startsWith("image/"))
    .slice(0, 6)
    .map((file) => `<img src="${file.dataUrl}" alt="${escapeHtml(file.name)}" />`)
    .join("");

  const printWindow = window.open("", "_blank", "noopener");
  printWindow.document.write(`
    <!doctype html>
    <html>
    <head>
      <title>OS ${budget.os}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #111; }
        h1, h2, p { margin: 0; }
        h1 { font-size: 26px; }
        h2 { margin-top: 22px; font-size: 18px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
        .top { display: flex; justify-content: space-between; gap: 20px; }
        .box { margin-top: 12px; line-height: 1.55; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
        th { background: #f1f5f9; }
        .total { font-size: 20px; font-weight: bold; margin-top: 16px; }
        .accept { margin-top: 24px; padding: 14px; border: 2px dashed #116a5b; }
        .photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
        .photos img { width: 100%; height: 120px; object-fit: cover; border: 1px solid #ddd; }
        a { color: #0b5146; word-break: break-all; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <div class="top">
        <div>
          <h1>${escapeHtml(OFFICE.nome)}</h1>
          <p>${escapeHtml(OFFICE.telefone)}</p>
          <p>${escapeHtml(OFFICE.endereco)}</p>
        </div>
        <div>
          <h1>O.S #${budget.os}</h1>
          <p>Data: ${escapeHtml(budget.data)}</p>
          <p>Status: ${statusLabel(budget.status)}</p>
        </div>
      </div>

      <h2>Cliente</h2>
      <div class="box">
        <p>${escapeHtml(budget.cliente.nome)}</p>
        <p>${escapeHtml(budget.cliente.telefone)}</p>
        <p>${escapeHtml(budget.cliente.email || "Email não informado")}</p>
      </div>

      <h2>Veículo</h2>
      <div class="box">
        <p>${escapeHtml(budget.veiculo.placa)} - ${escapeHtml(budget.veiculo.modelo)}</p>
        <p>${escapeHtml(budget.veiculo.ano)} - ${escapeHtml(budget.veiculo.cor)}</p>
      </div>

      <h2>Itens</h2>
      <table>
        <thead><tr><th>Item</th><th>Valor</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>

      <div class="box">
        <p>Subtotal: ${money(budget.subtotal)}</p>
        <p>${discountLabel(budget.descontoPercentual, budget.descontoValor)}: ${money(budget.desconto)}</p>
        <p class="total">Valor final: ${money(budget.total)}</p>
      </div>

      <div class="accept">
        <h2>Link de aceite</h2>
        <p><strong>Aprovar orçamento:</strong></p>
        <p><a href="${buildApprovalLink(budget.os, "aprovar")}">${buildApprovalLink(budget.os, "aprovar")}</a></p>
        <p><strong>Reprovar orçamento:</strong></p>
        <p><a href="${buildApprovalLink(budget.os, "reprovar")}">${buildApprovalLink(budget.os, "reprovar")}</a></p>
      </div>

      ${photos ? `<h2>Fotos da O.S</h2><div class="photos">${photos}</div>` : ""}

      <script>
        window.onload = function() {
          window.print();
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

function openDrawer() {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  overlay.hidden = false;
}

function closeDrawer() {
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
}

function initEvents() {
  newBudgetButton.addEventListener("click", startNewBudget);
  searchButton.addEventListener("click", () => {
    searchPanel.hidden = !searchPanel.hidden;
    if (!searchPanel.hidden) searchInput.focus();
  });
  searchInput.addEventListener("input", renderHome);

  menuButton.addEventListener("click", openDrawer);
  closeMenuButton.addEventListener("click", closeDrawer);
  overlay.addEventListener("click", closeDrawer);

  document.querySelector("#manualPlateButton").addEventListener("click", () => {
    stopCamera();
    showView("manualPlateView");
    document.querySelector("#manualPlateInput").focus();
  });

  document.querySelector("#capturePlateButton").addEventListener("click", () => handlePlate(simulatePlateRead()));
  document.querySelector("#backToCameraButton").addEventListener("click", () => showView("plateView"));
  document.querySelector("#confirmManualPlateButton").addEventListener("click", () => handlePlate(document.querySelector("#manualPlateInput").value));

  document.querySelector("#backVehicleButton").addEventListener("click", () => showView("manualPlateView"));
  document.querySelector("#confirmVehicleButton").addEventListener("click", () => {
    readVehicleForm();
    if (!isValidPlate(draft.veiculo.placa)) {
      alert("Informe uma placa válida.");
      return;
    }
    rememberVehicle(draft.veiculo);
    renderClientStep();
  });

  document.querySelector("#clientBackButton").addEventListener("click", () => {
    if (currentClientStep > 0) {
      currentClientStep--;
      renderClientStep();
    } else {
      showView("vehicleView");
    }
  });

  document.querySelector("#clientNextButton").addEventListener("click", () => {
    if (!saveClientStep()) return;
    if (currentClientStep < clientSteps.length - 1) {
      currentClientStep++;
      renderClientStep();
    } else {
      renderParsedPreview();
      showView("budgetTextView");
      budgetTextInput.focus();
    }
  });

  document.querySelector("#backBudgetTextButton").addEventListener("click", () => {
    currentClientStep = clientSteps.length - 1;
    renderClientStep();
  });

  budgetTextInput.addEventListener("input", renderParsedPreview);
  document.querySelector("#finishBudgetButton").addEventListener("click", finishBudget);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installButton.hidden = true;
  });
}

initEvents();
renderHome();
checkApprovalFromUrl();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
