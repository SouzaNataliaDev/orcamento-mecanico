const form = document.querySelector("#budgetForm");
const itemsList = document.querySelector("#itemsList");
const itemTemplate = document.querySelector("#itemTemplate");
const addItemButton = document.querySelector("#addItemButton");
const clearButton = document.querySelector("#clearButton");
const installButton = document.querySelector("#installButton");
const messagePreview = document.querySelector("#messagePreview");
const totalPreview = document.querySelector("#totalPreview");
let deferredInstallPrompt = null;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function money(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function todayPlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "Nao informado";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function addItem(data = {}) {
  const node = itemTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector(".item-description").value = data.description || "";
  node.querySelector(".item-quantity").value = data.quantity || 1;
  node.querySelector(".item-price").value = data.price || "";
  itemsList.appendChild(node);
  updatePreview();
}

function getItems() {
  return [...itemsList.querySelectorAll(".item-row")].map((row) => {
    const description = row.querySelector(".item-description").value.trim();
    const quantity = Number(row.querySelector(".item-quantity").value) || 0;
    const price = Number(row.querySelector(".item-price").value) || 0;

    return {
      description,
      quantity,
      price,
      total: quantity * price,
    };
  });
}

function getBudget() {
  const items = getItems();
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discount = Number(document.querySelector("#discount").value) || 0;
  const total = Math.max(subtotal - discount, 0);

  return {
    clientName: document.querySelector("#clientName").value.trim(),
    clientPhone: document.querySelector("#clientPhone").value,
    vehicle: document.querySelector("#vehicle").value.trim(),
    plate: document.querySelector("#plate").value.trim().toUpperCase(),
    payment: document.querySelector("#payment").value,
    validUntil: document.querySelector("#validUntil").value,
    notes: document.querySelector("#notes").value.trim(),
    items,
    subtotal,
    discount,
    total,
  };
}

function buildMessage() {
  const budget = getBudget();
  const itemsText = budget.items
    .filter((item) => item.description)
    .map((item) => `- ${item.description} (${item.quantity}x): ${money(item.total)}`)
    .join("\n");

  const greetingName = budget.clientName || "cliente";
  const plateText = budget.plate ? `\nPlaca: ${budget.plate}` : "";
  const notesText = budget.notes ? `\n\nObservacoes:\n${budget.notes}` : "";

  return `Ola, ${greetingName}! Segue o orcamento do seu veiculo:

Veiculo: ${budget.vehicle || "Nao informado"}${plateText}

Servicos e pecas:
${itemsText || "- Nenhum item informado"}

Subtotal: ${money(budget.subtotal)}
Desconto: ${money(budget.discount)}
Total: ${money(budget.total)}

Pagamento: ${budget.payment}
Validade: ${formatDate(budget.validUntil)}${notesText}`;
}

function updatePreview() {
  const budget = getBudget();
  totalPreview.textContent = money(budget.total);
  messagePreview.textContent = buildMessage();
}

function openWhatsApp() {
  const budget = getBudget();
  const phone = onlyDigits(budget.clientPhone);
  const phoneWithCountry = phone.startsWith("55") ? phone : `55${phone}`;
  const message = encodeURIComponent(buildMessage());

  if (phone.length < 10) {
    alert("Informe um WhatsApp com DDD antes de enviar.");
    return;
  }

  window.open(`https://wa.me/${phoneWithCountry}?text=${message}`, "_blank", "noopener");
}

addItemButton.addEventListener("click", () => addItem());

itemsList.addEventListener("click", (event) => {
  if (!event.target.matches(".remove-item")) return;
  const rows = itemsList.querySelectorAll(".item-row");
  if (rows.length === 1) {
    rows[0].querySelectorAll("input").forEach((input) => {
      input.value = input.classList.contains("item-quantity") ? "1" : "";
    });
  } else {
    event.target.closest(".item-row").remove();
  }
  updatePreview();
});

form.addEventListener("input", updatePreview);
form.addEventListener("change", updatePreview);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  openWhatsApp();
});

clearButton.addEventListener("click", () => {
  form.reset();
  itemsList.innerHTML = "";
  document.querySelector("#validUntil").value = todayPlusDays(7);
  addItem();
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

document.querySelector("#validUntil").value = todayPlusDays(7);
addItem({ description: "Mao de obra", quantity: 1 });
