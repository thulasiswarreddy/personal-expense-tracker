
"use strict";

const STORAGE_KEY = "spendwise_transactions_v1";

const $ = (selector) => document.querySelector(selector);

const form = $("#transactionForm");
const descriptionInput = $("#description");
const amountInput = $("#amount");
const categoryInput = $("#category");
const dateInput = $("#date");
const transactionList = $("#transactionList");
const emptyState = $("#emptyState");
const formMessage = $("#formMessage");

const categoryIcons = {
  Food: "🍜",
  Transport: "🚗",
  Shopping: "🛍️",
  Bills: "🧾",
  Education: "📚",
  Health: "💊",
  Entertainment: "🎬",
  Salary: "💼",
  Freelance: "💻",
  Other: "✦"
};

const incomeCategories = ["Salary", "Freelance", "Other"];
const expenseCategories = [
  "Food", "Transport", "Shopping", "Bills",
  "Education", "Health", "Entertainment", "Other"
];

let transactions = loadTransactions();
let editingId = null;
let messageTimer = null;

// Format amounts as Indian Rupees.
function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Use local calendar dates instead of UTC dates.
function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(dateString) {
  return parseDate(dateString).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function loadTransactions() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.description === "string" &&
      item.description.trim().length > 0 &&
      Number.isFinite(item.amount) &&
      item.amount > 0 &&
      item.amount <= 1000000000 &&
      ["income", "expense"].includes(item.type) &&
      typeof item.category === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      Number.isFinite(Date.parse(item.date + "T12:00:00")) &&
      parseDate(item.date).getFullYear() === Number(item.date.slice(0, 4)) &&
      parseDate(item.date).getMonth() + 1 === Number(item.date.slice(5, 7)) &&
      parseDate(item.date).getDate() === Number(item.date.slice(8, 10))
    );
  } catch (error) {
    console.error("Could not load saved transactions:", error);
    return [];
  }
}

function saveTransactions() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    return true;
  } catch (error) {
    console.error("Could not save transactions:", error);
    showMessage(
      "Could not save data. Check your browser storage settings.",
      true
    );
    return false;
  }
}

function getType() {
  return $('input[name="type"]:checked').value;
}

function getTotals(items = transactions) {
  return items.reduce(
    (totals, transaction) => {
      if (transaction.type === "income") {
        totals.income += transaction.amount;
      } else {
        totals.expenses += transaction.amount;
      }
      return totals;
    },
    { income: 0, expenses: 0 }
  );
}

function updateDashboard() {
  const { income, expenses } = getTotals();
  const balance = income - expenses;
  const savingsRate = income > 0
    ? ((balance / income) * 100)
    : 0;

  $("#totalBalance").textContent = formatMoney(balance);
  $("#totalIncome").textContent = formatMoney(income);
  $("#totalExpenses").textContent = formatMoney(expenses);
  $("#savingsRate").textContent = `${savingsRate.toFixed(1)}%`;

  renderTransactions();
  renderChart();
}

function getFilteredTransactions() {
  const query = $("#searchInput").value.trim().toLowerCase();
  const type = $("#typeFilter").value;

  return [...transactions]
    .filter((transaction) => {
      const matchesType = type === "all" || transaction.type === type;
      const searchableText =
        `${transaction.description} ${transaction.category}`.toLowerCase();

      return matchesType && searchableText.includes(query);
    })
    .sort((a, b) =>
      b.date.localeCompare(a.date) || b.createdAt - a.createdAt
    );
}

function renderTransactions() {
  const items = getFilteredTransactions();

  emptyState.hidden = items.length > 0;

  if (items.length === 0) {
    emptyState.textContent = transactions.length === 0
      ? "No transactions yet. Add your first transaction to get started."
      : "No transactions match your search or filter.";
  }

  transactionList.innerHTML = items.map((transaction) => {
    const icon = categoryIcons[transaction.category] || "✦";
    const sign = transaction.type === "income" ? "+" : "−";

    return `
      <tr>
        <td>
          <div class="transaction-name">
            <span class="transaction-icon">${icon}</span>
            <span>${escapeHTML(transaction.description)}</span>
          </div>
        </td>
        <td>${escapeHTML(transaction.category)}</td>
        <td>${formatDate(transaction.date)}</td>
        <td>
          <span class="amount ${transaction.type}">
            ${sign}${formatMoney(transaction.amount)}
          </span>
        </td>
        <td>
          <div class="action-group">
            <button class="action-btn" data-action="edit"
              data-id="${escapeHTML(transaction.id)}">Edit</button>
            <button class="action-btn delete" data-action="delete"
              data-id="${escapeHTML(transaction.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  $("#tableFooter").textContent =
    `Showing ${items.length} of ${transactions.length} transaction(s)`;
}

function getMonthKey(date) {
  return date.slice(0, 7);
}

function getChartData() {
  const period = $("#chartPeriod").value;
  const now = new Date();
  const points = [];

  if (period === "month") {
    // Show daily spending for the last seven days of this month-to-date.
    const lastDay = now.getDate();
    const firstDay = Math.max(1, lastDay - 6);

    for (let day = firstDay; day <= lastDay; day++) {
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      const dateKey = localDateString(date);

      const total = transactions
        .filter((t) => t.type === "expense" && t.date === dateKey)
        .reduce((sum, t) => sum + t.amount, 0);

      points.push({
        label: String(day),
        value: total,
        title: date.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short"
        })
      });
    }
  } else {
    // Show the last six calendar months, including the current month.
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = localDateString(date).slice(0, 7);

      const total = transactions
        .filter((t) => t.type === "expense" && getMonthKey(t.date) === key)
        .reduce((sum, t) => sum + t.amount, 0);

      points.push({
        label: date.toLocaleDateString("en-IN", { month: "short" }),
        value: total,
        title: date.toLocaleDateString("en-IN", {
          month: "long",
          year: "numeric"
        })
      });
    }
  }

  return points;
}

function renderChart() {
  const points = getChartData();
  const maxValue = Math.max(...points.map((p) => p.value), 0);

  $("#spendingChart").innerHTML = points.map((point) => {
    const height = maxValue > 0
      ? (point.value / maxValue) * 100
      : 0;

    return `
      <div class="chart-column" title="${escapeHTML(point.title)}: ${formatMoney(point.value)}">
        <span class="bar-value">${point.value > 0
          ? escapeHTML(formatMoney(point.value).replace("₹", ""))
          : "—"}</span>
        <div class="bar-track">
          <div class="bar-fill" style="height: ${height}%"></div>
        </div>
        <span class="bar-label">${escapeHTML(point.label)}</span>
      </div>
    `;
  }).join("");

  const total = points.reduce((sum, point) => sum + point.value, 0);

  $("#chartLegend").innerHTML = `
    <span><i class="legend-dot purple"></i>Expenses</span>
    <span><i class="legend-dot pale"></i>${$("#chartPeriod").value === "month"
      ? "Daily · Last 7 days"
      : "Monthly · Last 6 months"}</span>
    <span>Total: <strong>${formatMoney(total)}</strong></span>
  `;
}

function showMessage(message, isError = false) {
  clearTimeout(messageTimer);
  formMessage.textContent = message;
  formMessage.classList.toggle("error", isError);

  messageTimer = setTimeout(() => {
    formMessage.textContent = "";
    formMessage.classList.remove("error");
  }, 4000);
}

function updateCategoryOptions(selectedCategory) {
  const categories = getType() === "income"
    ? incomeCategories
    : expenseCategories;

  categoryInput.innerHTML = categories.map((category) => `
    <option value="${category}">${categoryIcons[category] || "✦"} ${category}</option>
  `).join("");

  if (categories.includes(selectedCategory)) {
    categoryInput.value = selectedCategory;
  }
}

function resetForm() {
  editingId = null;
  form.reset();

  $('input[name="type"][value="expense"]').checked = true;
  dateInput.value = localDateString();
  updateCategoryOptions("Food");

  $("#formHeading").textContent = "Add transaction";
  $(".submit-btn").textContent = "Save transaction →";
  $("#cancelEditBtn").classList.add("hidden");
  formMessage.textContent = "";
  formMessage.classList.remove("error");
}

function startEditing(id) {
  const transaction = transactions.find((t) => t.id === id);
  if (!transaction) return;

  editingId = id;
  descriptionInput.value = transaction.description;
  amountInput.value = transaction.amount;
  dateInput.value = transaction.date;

  $(`input[name="type"][value="${transaction.type}"]`).checked = true;
  updateCategoryOptions(transaction.category);
  categoryInput.value = transaction.category;

  $("#formHeading").textContent = "Edit transaction";
  $(".submit-btn").textContent = "Update transaction →";
  $("#cancelEditBtn").classList.remove("hidden");

  $("#transactionFormPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });

  descriptionInput.focus();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const description = descriptionInput.value.trim();
  const amount = Number(amountInput.value);
  const type = getType();
  const category = categoryInput.value;
  const date = dateInput.value;
  const today = localDateString();

  if (!description) {
    showMessage("Please enter a description.", true);
    descriptionInput.focus();
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
    showMessage("Enter a valid amount greater than zero.", true);
    amountInput.focus();
    return;
  }

  if (!date || !Number.isFinite(Date.parse(date + "T12:00:00"))) {
    showMessage("Please select a valid date.", true);
    dateInput.focus();
    return;
  }

  const parsedDate = parseDate(date);
  if (
    parsedDate.getFullYear() !== Number(date.slice(0, 4)) ||
    parsedDate.getMonth() + 1 !== Number(date.slice(5, 7)) ||
    parsedDate.getDate() !== Number(date.slice(8, 10))
  ) {
    showMessage("Please select a valid calendar date.", true);
    return;
  }

  if (date > today) {
    showMessage("Date cannot be in the future.", true);
    dateInput.focus();
    return;
  }

  const validCategories = type === "income"
    ? incomeCategories
    : expenseCategories;

  if (!validCategories.includes(category)) {
    showMessage("Please select a valid category for this transaction.", true);
    return;
  }

  const now = Date.now();

  if (editingId) {
    const index = transactions.findIndex((t) => t.id === editingId);
    if (index === -1) {
      showMessage("Transaction not found. Please try again.", true);
      resetForm();
      return;
    }

    const previous = transactions[index];

    transactions[index] = {
      ...previous,
      description,
      amount,
      type,
      category,
      date,
      updatedAt: now
    };
  } else {
    transactions.push({
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${now}-${Math.random().toString(36).slice(2)}`,
      description,
      amount,
      type,
      category,
      date,
      createdAt: now
    });
  }

  if (!saveTransactions()) return;

  resetForm();
  updateDashboard();
  showMessage("Transaction saved successfully.");
});

transactionList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit") {
    startEditing(id);
  }

  if (action === "delete") {
    const transaction = transactions.find((t) => t.id === id);
    if (!transaction) return;

    const confirmed = window.confirm(
      `Delete "${transaction.description}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    const previous = transactions;
    transactions = transactions.filter((t) => t.id !== id);

    if (!saveTransactions()) {
      transactions = previous;
      return;
    }

    if (editingId === id) resetForm();
    updateDashboard();
  }
});

$('input[name="type"][value="expense"]').addEventListener("change", () => {
  updateCategoryOptions("Food");
});

$('input[name="type"][value="income"]').addEventListener("change", () => {
  updateCategoryOptions("Salary");
});

$("#cancelEditBtn").addEventListener("click", resetForm);

$("#openFormBtn").addEventListener("click", () => {
  resetForm();
  $("#transactionFormPanel").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
  descriptionInput.focus();
});

$("#searchInput").addEventListener("input", renderTransactions);
$("#typeFilter").addEventListener("change", renderTransactions);
$("#chartPeriod").addEventListener("change", renderChart);

// Set the date and initialise the dashboard.
$("#today").textContent = new Date().toLocaleDateString("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric"
});

$("#year").textContent = new Date().getFullYear();
dateInput.value = localDateString();
updateCategoryOptions("Food");
updateDashboard();