const CACHE_NAME = 'uzkodex-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './database.json',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap'
];

// Install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching assets');
        return cache.addAll(ASSETS);
      })
  );
});

// Activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      );
    })
  );
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cacheRes => {
        return cacheRes || fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            // Only cache local assets or fonts
            if (event.request.url.includes(location.origin) || event.request.url.includes('fonts')) {
                cache.put(event.request.url, fetchRes.clone());
            }
            return fetchRes;
          });
        });
      }).catch(() => {
        if (event.request.url.indexOf('.html') > -1) {
          return caches.match('./index.html');
        }
      })
  );
});
