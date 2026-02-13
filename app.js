// استفاده از سرویس corsproxy.io که سرعت بالاتری دارد
const CORS_PROXY = "https://corsproxy.io/?";

const sources = [
  // 1. طلای ۱۸ عیار (WallGold - قیمت زنده)
  {
    id: "wallgold",
    name: "WallGold (طلای ۱۸)",
    description: "قیمت خرید هر گرم طلای ۱۸ عیار",
    currency: "تومان",
    url: "https://api.wallgold.ir/api/v1/price?symbol=GLD_18C_750TMN&side=buy",
    parseResponse: (data) => {
      if (!data || !data.result) {
        throw new Error("ساختار پاسخ API وال‌گلد نامعتبر است");
      }
      let rawPrice = data.result.price;
      if (typeof rawPrice === "string") rawPrice = rawPrice.replace(/,/g, "");
      return {
        price: Number(rawPrice),
        priceExpiresAt: data.result.priceExpiresAt,
        currentTime: data.result.currentTime,
      };
    },
  },



  // 2. دلار (از متادیتای چارت WallGold)
  {
    id: "wallgold-dollar",
    name: "دلار (WallGold)",
    description: "نرخ دلار بازار آزاد",
    currency: "تومان",
    // آدرس API چارت
    url: "https://api.wallgold.ir/api/v1/chart?symbol=GLD_18C_750TMN&chartType=MONTHLY",
    parseResponse: (data) => {
      // 1. بررسی وجود آرایه metaData (با D بزرگ)
      if (!data || !data.result || !Array.isArray(data.result.metaData)) {
        throw new Error("اطلاعات متادیتا در پاسخ یافت نشد");
      }

      // 2. پیدا کردن آیتم دلار از داخل آرایه
      const dollarItem = data.result.metaData.find(item => item.symbol === "DOLLAR");

      if (!dollarItem) {
        throw new Error("آیتم دلار در لیست پیدا نشد");
      }

      return {
        price: Number(dollarItem.price),
        currentTime: new Date().toISOString(), // چارت زمان لحظه‌ای ندارد، از زمان سیستم استفاده می‌کنیم
        priceExpiresAt: null, 
      };
    },
  },

  // 3. انس جهانی طلا (از متادیتای چارت WallGold)
  {
    id: "wallgold-ounce",
    name: "انس جهانی طلا (WallGold)",
    description: "قیمت هر انس طلا (Gold Ounce)",
    currency: "دلار",
    url: "https://api.wallgold.ir/api/v1/chart?symbol=GLD_18C_750TMN&chartType=MONTHLY",
    parseResponse: (data) => {
      // 1. بررسی وجود آرایه
      if (!data || !data.result || !Array.isArray(data.result.metaData)) {
        throw new Error("اطلاعات متادیتا در پاسخ یافت نشد");
      }

      // 2. پیدا کردن آیتم انس طلا
      const ounceItem = data.result.metaData.find(item => item.symbol === "GOLD_OUNCE");

      if (!ounceItem) {
        throw new Error("آیتم انس طلا در لیست پیدا نشد");
      }

      return {
        price: Number(ounceItem.price),
        currentTime: new Date().toISOString(),
        priceExpiresAt: null,
      };
    },
  },
    // 4. میلی‌گلد (Milli Gold)
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
          throw new Error(`پاسخ نامعتبر از سرور (Code: ${data?.code})`);
        }
        let rawPrice = data.data.price18 + '00';
        if (typeof rawPrice === "string") rawPrice = rawPrice.replace(/,/g, "").trim();
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

// فرمت‌دهی پول
function formatPrice(value, currency) {
  try {
    const num = Number(value);
    
    // اگر واحد دلار بود، با فرمت دلار آمریکا و دو رقم اعشار نشان بده
    if (currency === "دلار") {
        return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // برای تومان، اعشار را حذف کن و سه رقم سه رقم جدا کن
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
  statusTextEl.textContent = "در حال اتصال...";

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(source.url, {
      method: "GET",
      signal: controller.signal,
      referrerPolicy: "no-referrer",
      headers: {
        Accept: "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`خطا در شبکه: ${response.status}`);
    }

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

  } catch (err) {
    console.error(`Error fetching ${source.id}:`, err);

    statusTextEl.textContent = "خطا";
    statusDotEl.classList.add("error");
    statusDotEl.style.backgroundColor = "#ef4444";
    statusDotEl.style.boxShadow = "0 0 0 3px rgba(248, 113, 113, 0.28)";

    if (err.name === "AbortError") {
      errorEl.textContent = "تایم‌اوت: پاسخ سرور طول کشید.";
    } else {
      errorEl.textContent = `خطا: ${err.message}`;
    }
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
  sources.forEach((source) => {
    const card = createCardElement(source);
    cardsContainer.appendChild(card);
  });
  
  refreshBtn.addEventListener("click", refreshAll);
  refreshAll();
  setInterval(refreshAll, 60000);
}

document.addEventListener("DOMContentLoaded", init);

