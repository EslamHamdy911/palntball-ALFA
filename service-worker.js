const CACHE_NAME = 'my-game-cache-v1'; // اسم ذاكرة التخزين المؤقت، غيّرها لتحديث المحتوى
const urlsToCache = [
    '/', // هذا يمثل index.html إذا كان على الجذر
    '/index.html',
    '/style.css',
    '/main.js',
    '/player.png',
    '/enemy.png',
    '/background.png',
    // أضف هنا جميع الأصول الأخرى التي تحتاجها لتعمل اللعبة بدون اتصال
];

// حدث التثبيت (Install Event) - عند تثبيت Service Worker لأول مرة
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// حدث الجلب (Fetch Event) - عند محاولة جلب أي مورد
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // إذا كان المورد موجودًا في ذاكرة التخزين المؤقت، قم بإرجاعه
                if (response) {
                    return response;
                }
                // وإلا، قم بطلب المورد من الشبكة
                return fetch(event.request)
                    .then(response => {
                        // إذا كان الطلب ناجحًا، قم بتخزين الاستجابة في ذاكرة التخزين المؤقت
                        // ثم أعد الاستجابة
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        let responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    })
                    .catch(() => {
                        // في حالة عدم توفر الاتصال ولا يوجد المورد في ذاكرة التخزين المؤقت
                        // يمكنك هنا تقديم صفحة "عدم اتصال" احتياطية إذا كانت لديك (مثل offline.html)
                        // أو مجرد رسالة خطأ
                        // return caches.match('/offline.html');
                        // في حالتنا، سنرجع رسالة خطأ بسيطة إذا لم يتم العثور على أي شيء
                        return new Response("<h1>No Internet, and resource not cached!</h1>", {
                            headers: { 'Content-Type': 'text/html' }
                        });
                    });
            })
    );
});

// حدث التفعيل (Activate Event) - لتنظيف أي ذاكرة تخزين مؤقت قديمة
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
