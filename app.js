// استفاده از سرویس corsproxy.io که سرعت بالاتری دارد
const CORS_PROXY = "https://corsproxy.io/?";

const sources = [
  {
    id: "wallgold",
    name: "WallGold",
    description: "قیمت خرید هر گرم طلای ۱۸ عیار - تومان (WallGold)",
    currency: "تومان",
    // وال‌گلد معمولاً نیاز به پروکسی ندارد، اما اگر خطا داد پروکسی را اضافه کنید
    url: "https://api.wallgold.ir/api/v1/price?symbol=GLD_18C_750TMN&side=buy",
    parseResponse: (data) => {
      // بررسی اولیه
      if (!data || !data.result) {
        throw new Error("ساختار پاسخ API وال‌گلد نامعتبر است");
      }

      // هندل کردن قیمت (ممکن است رشته یا عدد باشد)
      let rawPrice = data.result.price;
      // حذف کاما اگر وجود داشته باشد
      if (typeof rawPrice === "string") rawPrice = rawPrice.replace(/,/g, "");

      const price = Number(rawPrice);
      if (Number.isNaN(price)) {
        throw new Error("مقدار قیمت وال‌گلد نامعتبر است");
      }

      return {
        price,
        priceExpiresAt: data.result.priceExpiresAt,
        currentTime: data.result.currentTime,
      };
    },
  },
  {
    id: "milligold",
    name: "Milli Gold",
    description: "قیمت هر گرم طلای ۱۸ عیار - Milli Gold",
    currency: "تومان",
    // استفاده از URL انکود شده به همراه پروکسی سریع‌تر
    url: `${CORS_PROXY}${encodeURIComponent(
      "https://milli.gold/api/v1/public/milli-price/detail"
    )}`,
    parseResponse: (data) => {
      console.log("MilliGold Data:", data); // برای مشاهده خروجی در کنسول

      // بررسی اینکه آیا دیتا درست دریافت شده (کد 0 یا مشابه آن)
      if (!data || (data.code != 0 && data.code != 200) || !data.data) {
        // گاهی اوقات ارورهای خاصی برمی‌گرداند
        throw new Error(`پاسخ نامعتبر از سرور (Code: ${data?.code})`);
      }

      let rawPrice = data.data.price18;
      // تمیزکاری قیمت (حذف کاما و فاصله‌های احتمالی)
      if (typeof rawPrice === "string") {
        rawPrice = rawPrice.replace(/,/g, "").trim();
      }

      const price = Number(rawPrice);
      if (Number.isNaN(price)) {
        throw new Error(`فرمت قیمت نامعتبر: ${data.data.price18}`);
      }

      return {
        price,
        priceExpiresAt: null, // این API زمان انقضا ندارد
        currentTime: data.data.date,
      };
    },
  },
];

const cardsContainer = document.getElementById("cards-container");
const refreshBtn = document.getElementById("refresh-btn");
const lastUpdatedSpan = document.getElementById("last-updated");

// فرمت‌دهی پول (مثلاً ۱۸,۰۰۰,۰۰۰)
function formatPrice(value, currency) {
  try {
    return `${Number(value).toLocaleString("fa-IR")} ${currency}`;
  } catch {
    return `${value} ${currency}`;
  }
}

// فرمت‌دهی تاریخ و ساعت
function formatDateTime(isoString) {
  if (!isoString) return "نامشخص";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "نامعتبر";
  return date.toLocaleString("fa-IR");
}

function updateGlobalLastUpdated() {
  const now = new Date();
  lastUpdatedSpan.textContent = `آخرین بروزرسانی: ${now.toLocaleString(
    "fa-IR"
  )}`;
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
        <span id="expires-at-${source.id}">انقضا: —</span>
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
  priceEl.style.opacity = "0.4"; // کمرنگ کردن قیمت قبلی
  statusDotEl.className = "status-dot"; // ریست رنگ چراغ
  statusTextEl.textContent = "در حال اتصال...";

  try {
    const controller = new AbortController();
    // افزایش تایم‌اوت به ۲۵ ثانیه برای اطمینان بیشتر در صورت کندی پروکسی
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(source.url, {
      method: "GET",
      signal: controller.signal,
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

    // آپدیت UI
    priceEl.textContent = formatPrice(parsed.price, source.currency);
    priceEl.style.opacity = "1";

    updatedAtEl.textContent = `به‌روزرسانی: ${formatDateTime(
      parsed.currentTime
    )}`;
    
    if (parsed.priceExpiresAt) {
      expiresAtEl.textContent = `انقضا: ${formatDateTime(
        parsed.priceExpiresAt
      )}`;
    } else {
      expiresAtEl.textContent = "انقضا: نامشخص";
    }

    statusTextEl.textContent = "موفق";
    statusDotEl.classList.add("success"); // اگر در CSS کلاسی برای سبز شدن دارید
    // یا به صورت دستی:
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
    // اجرا به صورت موازی
    await Promise.all(sources.map((src) => fetchPriceForSource(src)));
    updateGlobalLastUpdated();
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "بروزرسانی دستی";
  }
}

function init() {
  // پاکسازی کانتینر قبل از ساخت کارت‌ها (برای جلوگیری از تکرار در ریلودهای خاص)
  cardsContainer.innerHTML = "";
  
  sources.forEach((source) => {
    const card = createCardElement(source);
    cardsContainer.appendChild(card);
  });

  refreshBtn.addEventListener("click", refreshAll);

  // اجرای اولیه
  refreshAll();

  // بروزرسانی خودکار هر ۶۰ ثانیه
  setInterval(refreshAll, 60000);
}

document.addEventListener("DOMContentLoaded", init);