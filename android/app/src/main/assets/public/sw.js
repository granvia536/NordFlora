/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "7bb59495087c45f152907a8960711352"
  }, {
    "url": "pwa-512x512.png",
    "revision": "23310249829b8d38145f1e97eb227ace"
  }, {
    "url": "pwa-192x192.png",
    "revision": "7254c029acd590cb3597842acf6d3e3d"
  }, {
    "url": "index.html",
    "revision": "2b26dbe8e4a19a14c64a74f4e8a75510"
  }, {
    "url": "icon.svg",
    "revision": "8b16eb42526a1d911f166351784eeef6"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "462765c3bd01165b3de45cc6317bb524"
  }, {
    "url": "src/assets/images/barcelona_north_window_1795203694182.jpg",
    "revision": "e3bd59a6e05d5e43df24be2e26a5297e"
  }, {
    "url": "src/assets/images/app_icon_emblem_1795203692837.jpg",
    "revision": "e7c64c7fe664f4bcbb903a904ff99d2e"
  }, {
    "url": "assets/web-D23EwfET.js",
    "revision": null
  }, {
    "url": "assets/index-ByhzGZtw.js",
    "revision": null
  }, {
    "url": "assets/index-1IQ4676O.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "462765c3bd01165b3de45cc6317bb524"
  }, {
    "url": "icon.svg",
    "revision": "8b16eb42526a1d911f166351784eeef6"
  }, {
    "url": "pwa-192x192.png",
    "revision": "7254c029acd590cb3597842acf6d3e3d"
  }, {
    "url": "pwa-512x512.png",
    "revision": "23310249829b8d38145f1e97eb227ace"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "7bb59495087c45f152907a8960711352"
  }, {
    "url": "manifest.webmanifest",
    "revision": "a8208577319190fda996ac8498e0a2af"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
