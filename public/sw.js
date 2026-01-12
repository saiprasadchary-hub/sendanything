const CACHE_NAME = 'send-anything-v2';
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.png',
    '/logo.png',
    '/icon-192.png',
    '/icon-512.png',
    '/peerjs.min.js'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', event => {
    // Network-First strategy for HTML navigation requests (ensures fresh index.html when online)
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request, { cache: 'no-cache' })
                .then(response => {
                    // Update cache with new version
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if offline - CRITICAL for offline mode
                    return caches.match(event.request)
                        .then(cachedResponse => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Return a basic offline page if nothing in cache
                            return caches.match('/index.html');
                        });
                })
        );
        return;
    }

    // Cache-First for all other assets (JS, CSS, images) - WORKS OFFLINE
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // Return cached response immediately
                    return response;
                }
                // If not in cache, fetch from network and cache it
                return fetch(event.request)
                    .then(fetchResponse => {
                        // Cache the new resource
                        if (fetchResponse && fetchResponse.status === 200) {
                            const responseClone = fetchResponse.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, responseClone);
                            });
                        }
                        return fetchResponse;
                    })
                    .catch(() => {
                        // If offline and not in cache, return null
                        return null;
                    });
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        Promise.all([
            self.clients.claim(),
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheWhitelist.indexOf(cacheName) === -1) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});
