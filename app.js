// استفاده از سرویس corsproxy.io که سرعت بالاتری دارد
const CORS_PROXY = "https://corsproxy.io/?";

const sources = [
  // 1. طلای ۱۸ عیار (WallGold)
  {
    id: "wallgold",
    name: "WallGold (طلای ۱۸)",
    description: "قیمت خرید هر گرم طلای ۱۸ عیار",
    currency: "تومان",
    url: "https://api.wallgold.ir/api/v1/price?symbol=GLD_18C_750TMN&side=buy",
    parseResponse: (data) => {
      if (!data || !data.result) throw new Error("ساختار پاسخ نامعتبر");
      let rawPrice = data.result.price;
      if (typeof rawPrice === "string") rawPrice = rawPrice.replace(/,/g, "");
      return {
        price: Number(rawPrice),
        priceExpiresAt: data.result.priceExpiresAt,
        currentTime: data.result.currentTime,
      };
    },
  },

  // 2. دلار (WallGold)
  {
    id: "wallgold-dollar",
    name: "دلار (WallGold)",
    description: "نرخ دلار بازار آزاد",
    currency: "تومان",
    url: "https://api.wallgold.ir/api/v1/chart?symbol=GLD_18C_750TMN&chartType=MONTHLY",
    parseResponse: (data) => {
      if (!data?.result?.metaData) throw new Error("متادیتا یافت نشد");
      const item = data.result.metaData.find((i) => i.symbol === "DOLLAR");
      if (!item) throw new Error("دلار یافت نشد");
      return {
        price: Number(item.price),
        currentTime: new Date().toISOString(),
        priceExpiresAt: null,
      };
    },
  },

  // 3. انس جهانی (WallGold)
  {
    id: "wallgold-ounce",
    name: "انس جهانی طلا",
    description: "قیمت هر انس طلا (دلار)",
    currency: "دلار",
    url: "https://api.wallgold.ir/api/v1/chart?symbol=GLD_18C_750TMN&chartType=MONTHLY",
    parseResponse: (data) => {
      if (!data?.result?.metaData) throw new Error("متادیتا یافت نشد");
      const item = data.result.metaData.find((i) => i.symbol === "GOLD_OUNCE");
      if (!item) throw new Error("انس طلا یافت نشد");
      return {
        price: Number(item.price),
        currentTime: new Date().toISOString(),
        priceExpiresAt: null,
      };
    },
  },

  // 4. میلی‌گلد
  {
    id: "milligold",
    name: "Milli Gold",
    description: "قیمت هر گرم طلای ۱۸ عیار",
    currency: "تومان",
    url: `${CORS_PROXY}${encodeURIComponent(
      "https://milli.gold/api/v1/public/milli-price/detail"
    )}`,
    parseResponse: (data) => {
      if (!data || (data.code != 0 && data.code != 200) || !data.data) {
        throw new Error(`پاسخ نامعتبر (Code: ${data?.code})`);
      }
      let rawPrice = data.data.price18 + "00";
      if (typeof rawPrice === "string")
        rawPrice = rawPrice.replace(/,/g, "").trim();
      return {
        price: Number(rawPrice),
        priceExpiresAt: null,
        currentTime: data.data.date,
      };
    },
  },
];

const cardsContainer = document.getElementById("cards-container");
const refreshBtn = document.getElementById("refresh-btn");
const lastUpdatedSpan = document.getElementById("last-updated");

// --- توابع کمکی ---

function formatPrice(value, currency) {
  try {
    const num = Number(value);
    if (isNaN(num)) return "—";
    
    if (currency === "دلار") {
      return `$${num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `${Math.round(num).toLocaleString("fa-IR")} ${currency}`;
  } catch {
    return `${value} ${currency}`;
  }
}

function formatDateTime(isoString) {
  if (!isoString) return "نامشخص";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "نامعتبر";
  return date.toLocaleString("fa-IR");
}

function updateGlobalLastUpdated() {
  const now = new Date();
  lastUpdatedSpan.textContent = `آخرین بروزرسانی: ${now.toLocaleString("fa-IR")}`;
}

// --- ساخت کارت‌های API ---

function createCardElement(source) {
  const card = document.createElement("article");
  card.className = "card";
  card.id = `card-${source.id}`;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-exchange-name">${source.name}</div>
      <span class="badge">API</span>
    </div>
    <div class="price-row">
      <span class="price-value" id="price-${source.id}">—</span>
      <span class="price-unit">${source.currency}</span>
    </div>
    <div class="loading" id="loading-${source.id}">در حال دریافت...</div>
    <div class="error-text" id="error-${source.id}" style="display: none;"></div>
    <div class="meta-row">
      <div class="status">
        <span class="status-dot" id="status-dot-${source.id}"></span>
        <span class="status-text" id="status-text-${source.id}">در انتظار</span>
      </div>
      <div class="timestamps">
        <span id="updated-at-${source.id}">به‌روزرسانی: —</span>
        <span id="expires-at-${source.id}" style="display:none"></span> 
      </div>
    </div>
    <div class="description" style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.5rem; opacity: 0.8;">
      ${source.description || ""}
    </div>
  `;

  return card;
}

// --- ساخت کارت ماشین حساب (بخش جدید) ---

function createCalculatorCard() {
  const card = document.createElement("article");
  card.className = "card";
  card.style.borderColor = "rgba(250, 204, 21, 0.4)"; // کادر طلایی‌تر برای تمایز

  card.innerHTML = `
    <div class="card-header">
      <div class="card-exchange-name">محاسبه‌گر طلا</div>
      <span class="badge" style="background: rgba(250, 204, 21, 0.1); color: #facc15;">دستی</span>
    </div>
    
    <div class="calc-group">
      <div class="calc-input-wrapper">
        <input type="number" id="calc-ounce" class="calc-input" placeholder="مثلاً 2600">
        <span class="calc-label">انس ($)</span>
      </div>
      <div class="calc-input-wrapper">
        <input type="number" id="calc-dollar" class="calc-input" placeholder="مثلاً 60000">
        <span class="calc-label">دلار (ت)</span>
      </div>
    </div>

    <div class="calc-divider"></div>

    <div class="price-row" style="justify-content: center;">
      <span class="price-value" id="calc-result">0</span>
      <span class="price-unit">تومان</span>
    </div>
    
    <div class="description" style="text-align: center; font-size: 0.75rem; color: #9ca3af;">
      قیمت هر گرم طلای ۱۸ عیار
    </div>
  `;

  // افزودن لاجیک محاسبه به کارت
  const ounceInput = card.querySelector("#calc-ounce");
  const dollarInput = card.querySelector("#calc-dollar");
  const resultSpan = card.querySelector("#calc-result");

  function calculate() {
    const ounce = parseFloat(ounceInput.value);
    const dollar = parseFloat(dollarInput.value);

    if (!ounce || !dollar) {
      resultSpan.textContent = "0";
      return;
    }

    // فرمول استاندارد: (انس / 31.1035) * دلار * 0.75
    // توضیح: انس تقسیم بر 31.1 میشه قیمت یک گرم طلای 24 عیار جهانی
    // ضربدر دلار میشه قیمت یک گرم 24 عیار به تومان
    // ضربدر 0.75 (750) میشه قیمت یک گرم 18 عیار
    const gram24USD = ounce / 31.1035; 
    const gram24Toman = gram24USD * dollar;
    const gram18Toman = gram24Toman * 0.75;

    resultSpan.textContent = Math.round(gram18Toman).toLocaleString("fa-IR");
  }

  ounceInput.addEventListener("input", calculate);
  dollarInput.addEventListener("input", calculate);

  return card;
}

// --- دریافت اطلاعات API ---

async function fetchPriceForSource(source) {
  const loadingEl = document.getElementById(`loading-${source.id}`);
  const errorEl = document.getElementById(`error-${source.id}`);
  const priceEl = document.getElementById(`price-${source.id}`);
  const statusDotEl = document.getElementById(`status-dot-${source.id}`);
  const statusTextEl = document.getElementById(`status-text-${source.id}`);
  const updatedAtEl = document.getElementById(`updated-at-${source.id}`);
  const expiresAtEl = document.getElementById(`expires-at-${source.id}`);

  loadingEl.style.display = "block";
  errorEl.style.display = "none";
  priceEl.style.opacity = "0.4";
  statusDotEl.className = "status-dot";
  statusTextEl.textContent = "اتصال...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(source.url, {
      method: "GET",
      signal: controller.signal,
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error(`Status: ${response.status}`);

    const data = await response.json();
    const parsed = source.parseResponse(data);

    priceEl.textContent = formatPrice(parsed.price, source.currency);
    priceEl.style.opacity = "1";

    updatedAtEl.textContent = `به‌روزرسانی: ${formatDateTime(parsed.currentTime)}`;

    if (parsed.priceExpiresAt) {
      expiresAtEl.style.display = "block";
      expiresAtEl.textContent = `انقضا: ${formatDateTime(parsed.priceExpiresAt)}`;
    } else {
      expiresAtEl.style.display = "none";
    }

    statusTextEl.textContent = "موفق";
    statusDotEl.classList.add("success");
    statusDotEl.style.backgroundColor = "#22c55e";
    statusDotEl.style.boxShadow = "0 0 0 3px rgba(34, 197, 94, 0.32)";

    // اگر این سورس دلار یا انس بود، مقدارش رو توی ماشین حساب هم بذار (اختیاری)
    // اینجا رو ساده نگه میداریم

  } catch (err) {
    console.error(`Error ${source.id}:`, err);
    statusTextEl.textContent = "خطا";
    statusDotEl.classList.add("error");
    statusDotEl.style.backgroundColor = "#ef4444";
    statusDotEl.style.boxShadow = "0 0 0 3px rgba(248, 113, 113, 0.28)";
    errorEl.textContent = err.name === "AbortError" ? "تایم‌اوت" : err.message;
    errorEl.style.display = "block";
  } finally {
    loadingEl.style.display = "none";
  }
}

async function refreshAll() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "درحال دریافت...";
  try {
    await Promise.all(sources.map((src) => fetchPriceForSource(src)));
    updateGlobalLastUpdated();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "بروزرسانی دستی";
  }
}

function init() {
  cardsContainer.innerHTML = "";
  
  // 1. ساخت کارت‌های API
  sources.forEach((source) => {
    const card = createCardElement(source);
    cardsContainer.appendChild(card);
  });

  // 2. افزودن کارت ماشین حساب به انتهای لیست
  const calcCard = createCalculatorCard();
  cardsContainer.appendChild(calcCard);

  refreshBtn.addEventListener("click", refreshAll);
  refreshAll();
  setInterval(refreshAll, 60000);
}

document.addEventListener("DOMContentLoaded", init);
