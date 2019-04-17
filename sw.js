// Generate random asset hash
if (typeof hash === 'undefined') {
	var hash = '';
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (var i = 0; i < 10; i++) {
		hash += possible.charAt(Math.floor(Math.random() * possible.length));
	}
}

var assetsCache = 'assets_' + hash;
var validCaches = [ assetsCache, 'data' ];

// Skip waiting
self.addEventListener('install', function(event) {
	return event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(event) {
	// Claim all clients
	event.waitUntil(self.clients.claim());
	// Drop old caches
	event.waitUntil(
		caches.keys().then(function(cacheNames) {
			return Promise.all(
				cacheNames.map(function(cacheName) {
					if (!validCaches.includes(cacheName)) {
						console.log('Dropping invalid cache ' + cacheName);
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
});

self.addEventListener('fetch', function(event) {
	if (event.request.url.endsWith('.json') && !event.request.url.endsWith('/manifest.json')) {
		// This is data, prefer responding with online version
		event.respondWith(
			caches.open('data').then(function(cache) {
				return fetch(event.request).then(function(networkResp) {
					if (networkResp) {
						// Add the fetch data to the response
						var init = {
							status: networkResp.status,
							statusText: networkResp.statusText,
							headers: new Headers()
						};
						networkResp.headers.forEach(function(k, v) {
							init.headers[k] = v;
						});
						return networkResp.text().then(function(body) {
							var today = new Date();
							var dd = String(today.getDate()).padStart(2, '0');
							var mm = String(today.getMonth() + 1).padStart(2, '0');
							var yyyy = today.getFullYear();
							var hh = String(today.getHours()).padStart(2, '0');
							var min = String(today.getMinutes()).padStart(2, '0');
							var date = dd + '.' + mm + '.' + yyyy + ' ' + hh + ':' + min;

							var resp = new Response('{ "when": "' + date + '", "data": ' + body + '}', init);
							// Return the response
							cache.put(event.request, resp.clone());
							return resp;
						});
					}

					return cache.match(event.request);
				}).catch(function(err) {
					return cache.match(event.request);
				});
			}));
		return;
	}

	event.respondWith(
		caches.open(assetsCache).then(function(cache) {
			return cache.match(event.request).then(function(resp) {
				if (resp) {
					return resp;
				}

				return fetch(event.request).then(function(networkResp) {
					cache.put(event.request, networkResp.clone());
					return networkResp;
				});
			}).catch(function(err) {
				throw err;
			});
		})
	);
});
