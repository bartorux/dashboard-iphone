// Service Worker dla PSE Dashboard PWA
// Plik: sw.js

const CACHE_NAME = 'pse-dashboard-v1';
const API_CACHE_NAME = 'pse-api-cache-v1';

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdn.plot.ly/plotly-2.27.0.min.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all clients
            return self.clients.claim();
        })
    );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Handle API requests differently
    if (url.hostname === 'api.raporty.pse.pl') {
        event.respondWith(handleApiRequest(request));
    } else {
        event.respondWith(handleStaticRequest(request));
    }
});

// Handle API requests - network first, cache as fallback
async function handleApiRequest(request) {
    const cache = await caches.open(API_CACHE_NAME);
    
    try {
        // Always try network first for API data
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful API responses
            const responseClone = networkResponse.clone();
            await cache.put(request, responseClone);
            console.log('API data cached:', request.url);
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache for:', request.url);
        
        // Network failed, try cache
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('Serving from cache:', request.url);
            
            // Add a header to indicate this is cached data
            const response = cachedResponse.clone();
            response.headers.append('X-Served-From', 'cache');
            
            return response;
        }
        
        // If no cache available, return a meaningful error response
        return new Response(
            JSON.stringify({
                error: 'Brak połączenia internetowego',
                message: 'Nie można pobrać danych. Sprawdź połączenie internetowe.',
                cached: false
            }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Served-From': 'error'
                }
            }
        );
    }
}

// Handle static requests - cache first
async function handleStaticRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    
    // Try cache first for static assets
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // If not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache the response for future use
            await cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed for static asset:', request.url);
        
        // For the main HTML page, return a basic offline page
        if (request.destination === 'document') {
            return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>PSE Dashboard - Offline</title>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
                            background: linear-gradient(135deg, #c0392b 0%, #e74c3c 100%);
                            color: white;
                            text-align: center;
                            padding: 50px 20px;
                            margin: 0;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                        }
                        h1 { font-size: 24px; margin-bottom: 20px; }
                        p { font-size: 16px; margin-bottom: 30px; opacity: 0.9; }
                        button {
                            background: white;
                            color: #c0392b;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                        }
                    </style>
                </head>
                <body>
                    <h1>📱 PSE Dashboard</h1>
                    <h2>🔌 Tryb Offline</h2>
                    <p>Nie można połączyć się z internetem.<br>Sprawdź połączenie i spróbuj ponownie.</p>
                    <button onclick="window.location.reload()">🔄 Spróbuj ponownie</button>
                </body>
                </html>
            `, {
                headers: { 'Content-Type': 'text/html' }
            });
        }
        
        // For other requests, return a 503 error
        return new Response('Service Unavailable', { status: 503 });
    }
}

// Push notification event
self.addEventListener('push', event => {
    console.log('Push notification received');
    
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body || 'Nowy alert rezerw mocy!',
            icon: '/apple-touch-icon-180x180.png',
            badge: '/apple-touch-icon-180x180.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || '/'
            },
            actions: [
                {
                    action: 'open',
                    title: 'Otwórz Dashboard'
                },
                {
                    action: 'close',
                    title: 'Zamknij'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification('PSE Dashboard', options)
        );
    }
});

// Notification click event
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked');
    
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        // Open the app
        event.waitUntil(
            clients.openWindow(event.notification.data.url || '/')
        );
    }
});

// Background sync event (for when connection is restored)
self.addEventListener('sync', event => {
    console.log('Background sync event:', event.tag);
    
    if (event.tag === 'refresh-data') {
        event.waitUntil(refreshDataInBackground());
    }
});

// Function to refresh data in background
async function refreshDataInBackground() {
    console.log('Refreshing data in background...');
    
    try {
        const response = await fetch('https://api.raporty.pse.pl/api/pk5l-wp?$first=200');
        
        if (response.ok) {
            const cache = await caches.open(API_CACHE_NAME);
            await cache.put('https://api.raporty.pse.pl/api/pk5l-wp?$first=200', response.clone());
            console.log('Background data refresh completed');
            
            // Notify all clients about the update
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'DATA_UPDATED',
                    message: 'Dane zostały zaktualizowane w tle'
                });
            });
        }
    } catch (error) {
        console.log('Background refresh failed:', error);
    }
}

// Message event from main thread
self.addEventListener('message', event => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'REQUEST_UPDATE') {
        // Trigger a background sync
        self.registration.sync.register('refresh-data');
    }
});

console.log('PSE Dashboard Service Worker loaded successfully');
