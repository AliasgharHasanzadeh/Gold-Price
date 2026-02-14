const CACHE_NAME = "gold-pwa-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// نصب سرویس ورکر و کش کردن فایل‌های اولیه
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("Caching assets...");
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// فعال‌سازی و پاک کردن کش‌های قدیمی
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// مدیریت درخواست‌ها (ابتدا کش، اگر نبود شبکه)
self.addEventListener("fetch", (event) => {
  // اگر درخواست مربوط به API است، کش نکن (همیشه از اینترنت بگیر)
  if (event.request.url.includes("api.") || event.request.url.includes("corsproxy")) {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});