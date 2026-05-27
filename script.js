const STORAGE_KEY = "oficina_orcamentos_v2";
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
  { key: "nome", title: "Nome do cliente", label: "Nome", type: "text", placeholder: "Joao Silva" },
  { key: "telefone", title: "Telefone", label: "WhatsApp", type: "tel", placeholder: "DDD + numero" },
  { key: "email", title: "Email opcional", label: "Email", type: "email", placeholder: "cliente@email.com" },
];

const vehicleMock = {
  ABC1D23: { placa: "ABC1D23", modelo: "Volkswagen Gol 1.0", ano: "2020", cor: "Prata" },
  ABC1234: { placa: "ABC1234", modelo: "Fiat Uno Mille", ano: "2012", cor: "Branco" },
  BRA2E19: { placa: "BRA2E19", modelo: "Chevrolet Onix LT", ano: "2021", cor: "Preto" },
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function todayText() {
  return new Intl.DateTimeFormat("pt-BR").format(new Date());
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
    cliente: { nome: "", telefone: "", email: "" },
    veiculo: { placa: "", modelo: "", ano: "", cor: "" },
    itens: [],
    descontoPercentual: 0,
    descontoValor: 0,
    subtotal: 0,
    desconto: 0,
    total: 0,
  };
}

function loadBudgets() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {
    return [];
  }
  return [];
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
    homeView: "Orcamentos",
    plateView: "Ler placa",
    manualPlateView: "Placa",
    vehicleView: "Veiculo",
    clientView: "Cliente",
    budgetTextView: "Orcamento",
    detailView: "Resumo",
  };
  screenTitle.textContent = titles[id] || "Orcamentos";
  newBudgetButton.hidden = id !== "homeView";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHome() {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = budgets.filter((budget) => {
    const text = `${budget.os} ${budget.cliente.nome} ${budget.veiculo.placa}`.toLowerCase();
    return text.includes(term);
  });

  budgetCount.textContent = budgets.length;
  emptyState.hidden = filtered.length > 0;
  budgetList.innerHTML = filtered
    .map((budget) => `
      <button class="budget-card" type="button" data-os="${budget.os}">
        <span>
          <strong>O.S #${budget.os} - ${escapeHtml(budget.cliente.nome || "Cliente")}</strong>
          <span>${escapeHtml(budget.veiculo.placa || "Sem placa")}</span>
          <span>${escapeHtml(budget.data)}</span>
        </span>
        <span class="budget-total">${money(budget.total)}</span>
      </button>
    `)
    .join("");
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
  cameraStatus.textContent = "Abrindo camera traseira...";

  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "Camera indisponivel. Toque em Manual.";
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
    cameraStatus.textContent = "Nao foi possivel abrir a camera. Toque em Manual.";
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
    alert("Digite uma placa valida. Exemplos: ABC1234 ou ABC1D23.");
    return;
  }

  stopCamera();
  draft.veiculo = await consultarDadosVeiculo(cleanPlate);
  fillVehicleForm();
  showView("vehicleView");
}

async function consultarDadosVeiculo(placa) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (vehicleMemory[placa]) {
    return { ...vehicleMemory[placa] };
  }

  return vehicleMock[placa] || {
    placa,
    modelo: "Modelo nao encontrado",
    ano: "",
    cor: "",
  };
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
  document.querySelector("#clientFieldLabel").textContent = step.label;
  input.type = step.type;
  input.placeholder = step.placeholder;
  input.value = draft.cliente[step.key] || "";
  document.querySelector("#clientNextButton").textContent = currentClientStep === clientSteps.length - 1 ? "Continuar" : "Proximo";
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
    const description = line
      .replace(valueMatch[0], "")
      .replace(/\s*-\s*$/, "")
      .trim();

    if (description && value > 0) {
      items.push({ descricao: description, valor: value });
    }
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
      <div class="parsed-line">
        <span>${escapeHtml(item.descricao)}</span>
        <strong>${money(item.valor)}</strong>
      </div>
    `).join("") || "<span>Nenhum item identificado ainda.</span>"}
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
  document.querySelector("#detailCard").innerHTML = `
    <div class="detail-head">
      <div>
        <p class="eyebrow">Orcamento pronto</p>
        <h2>O.S #${budget.os}</h2>
      </div>
      <strong>${money(budget.total)}</strong>
    </div>

    <section class="detail-section">
      <h3>Cliente</h3>
      <span>${escapeHtml(budget.cliente.nome)}</span>
      <span>${escapeHtml(budget.cliente.telefone)}</span>
      <span>${escapeHtml(budget.cliente.email || "Email nao informado")}</span>
    </section>

    <section class="detail-section">
      <h3>Veiculo</h3>
      <span>${escapeHtml(budget.veiculo.placa)} - ${escapeHtml(budget.veiculo.modelo)}</span>
      <span>${escapeHtml(budget.veiculo.ano || "Ano nao informado")} - ${escapeHtml(budget.veiculo.cor || "Cor nao informada")}</span>
    </section>

    <section class="detail-section">
      <h3>Itens</h3>
      ${budget.itens.map((item) => `
        <div class="detail-line">
          <span>${escapeHtml(item.descricao)}</span>
          <strong>${money(item.valor)}</strong>
        </div>
      `).join("")}
      <div class="detail-line"><span>Subtotal</span><strong>${money(budget.subtotal)}</strong></div>
      <div class="detail-line"><span>${discountLabel(budget.descontoPercentual, budget.descontoValor)}</span><strong>${money(budget.desconto)}</strong></div>
      <div class="detail-line total-row"><span>Valor final</span><strong>${money(budget.total)}</strong></div>
    </section>

    <div class="button-row">
      <button class="secondary-button" type="button" id="pdfButton">Gerar PDF</button>
      <button class="primary-button" type="button" id="whatsButton">WhatsApp</button>
    </div>
    <div class="button-row">
      <button class="secondary-button" type="button" id="emailButton">Email</button>
      <button class="secondary-button" type="button" id="homeButton">Voltar ao inicio</button>
    </div>
  `;

  document.querySelector("#pdfButton").addEventListener("click", () => generatePdf(budget));
  document.querySelector("#whatsButton").addEventListener("click", () => shareWhatsApp(budget));
  document.querySelector("#emailButton").addEventListener("click", () => shareEmail(budget));
  document.querySelector("#homeButton").addEventListener("click", () => showView("homeView"));
}

function buildMessage(budget) {
  return `Ola, ${budget.cliente.nome}! Segue o orcamento:

O.S #${budget.os} - ${budget.data}
Veiculo: ${budget.veiculo.placa} - ${budget.veiculo.modelo}

${budget.itens.map((item) => `- ${item.descricao}: ${money(item.valor)}`).join("\n")}

Subtotal: ${money(budget.subtotal)}
${discountLabel(budget.descontoPercentual, budget.descontoValor)}: ${money(budget.desconto)}
Total: ${money(budget.total)}

${OFFICE.nome}
${OFFICE.telefone}`;
}

function shareWhatsApp(budget) {
  const phone = onlyDigits(budget.cliente.telefone);
  const to = phone.length >= 10 ? `55${phone.startsWith("55") ? phone.slice(2) : phone}` : "";
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(buildMessage(budget))}`, "_blank", "noopener");
}

function shareEmail(budget) {
  const subject = encodeURIComponent(`Orcamento O.S #${budget.os}`);
  const body = encodeURIComponent(buildMessage(budget));
  window.location.href = `mailto:${budget.cliente.email || ""}?subject=${subject}&body=${body}`;
}

function generatePdf(budget) {
  const rows = budget.itens.map((item) => `
    <tr><td>${escapeHtml(item.descricao).toUpperCase()}</td><td>${money(item.valor)}</td></tr>
  `).join("");
  const printWindow = window.open("", "_blank", "noopener");
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <title>OS ${budget.os}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111; padding: 28px; }
          h1 { margin: 0 0 8px; font-size: 28px; }
          h2 { margin: 22px 0 8px; font-size: 18px; }
          p { margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          td, th { border-bottom: 1px solid #ccc; padding: 10px; text-align: left; }
          td:last-child, th:last-child { text-align: right; }
          .total { font-size: 22px; font-weight: 700; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(OFFICE.nome)}</h1>
        <p>${escapeHtml(OFFICE.telefone)}</p>
        <p>${escapeHtml(OFFICE.endereco)}</p>
        <h2>Dados da O.S</h2>
        <p>Numero: #${budget.os}</p>
        <p>Data: ${escapeHtml(budget.data)}</p>
        <h2>Cliente</h2>
        <p>${escapeHtml(budget.cliente.nome)}</p>
        <p>${escapeHtml(budget.cliente.telefone)}</p>
        <p>${escapeHtml(budget.cliente.email || "Email nao informado")}</p>
        <h2>Veiculo</h2>
        <p>${escapeHtml(budget.veiculo.placa)} - ${escapeHtml(budget.veiculo.modelo)}</p>
        <p>${escapeHtml(budget.veiculo.ano)} - ${escapeHtml(budget.veiculo.cor)}</p>
        <h2>Itens</h2>
        <table>
          <thead><tr><th>Item</th><th>Valor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p>Subtotal: ${money(budget.subtotal)}</p>
        <p>${discountLabel(budget.descontoPercentual, budget.descontoValor)}: ${money(budget.desconto)}</p>
        <p class="total">Valor final: ${money(budget.total)}</p>
        <script>window.print();<\/script>
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
  document.querySelector("#manualPlateInput").value = draft.veiculo.placa;
  showView("manualPlateView");
  setTimeout(() => document.querySelector("#manualPlateInput").focus(), 120);
});

document.querySelector("#capturePlateButton").addEventListener("click", () => {
  handlePlate(simulatePlateRead());
});

document.querySelector("#confirmManualPlateButton").addEventListener("click", () => {
  handlePlate(document.querySelector("#manualPlateInput").value);
});

document.querySelector("#vehicleContinueButton").addEventListener("click", () => {
  readVehicleForm();
  if (!isValidPlate(draft.veiculo.placa)) {
    alert("Confira a placa antes de continuar.");
    return;
  }
  rememberVehicle(draft.veiculo);
  renderClientStep();
});

document.querySelector("#clientNextButton").addEventListener("click", () => {
  if (!saveClientStep()) return;
  if (currentClientStep < clientSteps.length - 1) {
    currentClientStep += 1;
    renderClientStep();
    return;
  }
  showView("budgetTextView");
  setTimeout(() => budgetTextInput.focus(), 120);
});

document.querySelector("#clientBackButton").addEventListener("click", () => {
  if (currentClientStep > 0) {
    currentClientStep -= 1;
    renderClientStep();
    return;
  }
  showView("vehicleView");
});

document.querySelectorAll("[data-back]").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.back));
});

budgetTextInput.addEventListener("input", renderParsedPreview);
document.querySelector("#finishBudgetButton").addEventListener("click", finishBudget);

budgetList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-os]");
  if (!card) return;
  const budget = budgets.find((item) => String(item.os) === card.dataset.os);
  if (!budget) return;
  draft = structuredClone(budget);
  renderDetail(budget);
  showView("detailView");
});

document.addEventListener("input", (event) => {
  if (event.target.classList.contains("plate-input")) {
    event.target.value = normalizePlate(event.target.value);
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  installButton.hidden = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

renderHome();
showView("homeView");
