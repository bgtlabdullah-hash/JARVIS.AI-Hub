const CACHE_NAME =
    "jarvis-ai-v10";


const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];


self.addEventListener(
    "install",
    event => {

        event.waitUntil(
            caches
                .open(CACHE_NAME)
                .then(
                    cache =>
                        cache.addAll(
                            APP_FILES
                        )
                )
        );

        self.skipWaiting();

    }
);


self.addEventListener(
    "activate",
    event => {

        event.waitUntil(

            caches.keys()
                .then(keys => {

                    return Promise.all(

                        keys.map(key => {

                            if (
                                key !== CACHE_NAME
                            ) {

                                return caches.delete(
                                    key
                                );

                            }

                        })

                    );

                })

        );

        self.clients.claim();

    }
);


self.addEventListener(
    "fetch",
    event => {

        const url =
            new URL(
                event.request.url
            );


        // NEVER cache API responses.
        if (
            url.pathname.startsWith(
                "/api/"
            )
        ) {

            return;

        }


        event.respondWith(

            caches.match(
                event.request
            )
            .then(
                cached => {

                    if (cached) {
                        return cached;
                    }

                    return fetch(
                        event.request
                    );

                }
            )

        );

    }
);
