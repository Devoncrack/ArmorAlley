import { aaLoader } from './aa-loader.js';
import { SPRITESHEET_URL, imageSpriteConfig } from './global.js';

const LS_VERSION_KEY = 'AA';
const LS_VERSION = '2023';

const IMAGE_ROOT = aaLoader.getImageRoot();

const emptyURL = 'NULL';

const blankImage = new Image();
blankImage.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

// sneaky tricks: source image -> canvas upscaling
const upscaleByName = {
  'base-sprite.png': 2,
  'base-sprite-enemy.png': 2,
  'base-sprite-burning.png': 2,
  'bomb.png': 2,
  'end-bunker.png': 2,
  'end-bunker-enemy.png': 2,
  'cloud-1.png': 2,
  'cloud-2.png': 2,
  'cloud-3.png': 2,
  'engineer-enemy-sprite-horizontal.png': 2,
  'engineer-sprite-horizontal.png': 2,
  'infantry-enemy-sprite-horizontal.png': 2,
  'infantry-sprite-horizontal.png': 2,
  'landing-pad-sprite.png': 2,
  'missile-launcher.png': 2,
  'missile-launcher-enemy.png': 2,
  'parachute-infantry.png': 2,
  'parachute-infantry-enemy.png': 2,
};

function addSeries(prefix, len) {
  for (let i = 0; i <= len; i++) {
    upscaleByName[`${prefix}${i}.png`] = 2;
  }
}

addSeries('balloon_', 8);
addSeries('explosion-large_', 4);
addSeries('explosion-large-2_', 4);
addSeries('generic-explosion_', 4);
addSeries('generic-explosion-2_', 4);
addSeries('helicopter_', 3);
addSeries('helicopter-enemy_', 3);
addSeries('helicopter-rotating_', 3);
addSeries('helicopter-rotating-enemy_', 3);
addSeries('shrapnel-glow_v', 11);
addSeries('smoke-glow_', 11);
addSeries('tank_', 2);
addSeries('tank-enemy_', 2);
addSeries('van_', 2);
addSeries('van-enemy_', 2);

const utils = {
  array: {
    compareByLastItem: () => {
      let result;

      return (a, b) => {
        const prop = a.length - 1;
        if (a[prop] < b[prop]) {
          result = -1;
        } else if (a[prop] > b[prop]) {
          result = 1;
        } else {
          result = 0;
        }
        return result;
      };
    },

    compare: (property) => {
      let result;

      return (a, b) => {
        if (a[property] < b[property]) {
          result = -1;
        } else if (a[property] > b[property]) {
          result = 1;
        } else {
          result = 0;
        }
        return result;
      };
    },

    shuffle: (array) => {
      // Fisher-Yates shuffle algo

      // guard / avoid redundant work
      if (!array || array.excludeShuffle) return array;

      let i, j, temp;

      for (i = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }

      // special case: shuffle 2-item arrays only once to avoid errant repetition.
      if (array.length === 2) array.excludeShuffle = true;

      return array;
    }
  },

  css: {
    has: (o, cStr) => {
      // modern
      if (o?.classList) {
        return o.classList.contains(cStr);
      }
      // legacy
      return o.className !== undefined
        ? new RegExp(`(^|\\s)${cStr}(\\s|$)`).test(o.className)
        : false;
    },

    add: (o, ...toAdd) => o?.classList?.add(...toAdd),

    remove: (o, ...toRemove) => o?.classList?.remove(...toRemove),

    addOrRemove: (o, conditionToAdd, ...classNames) => {
      utils.css[conditionToAdd ? 'add' : 'remove'](o, ...classNames);
    },

    swap: (o, cssOut, cssIn) => {
      if (!o?.classList) return;
      if (cssOut) {
        o.classList.remove(cssOut);
      }
      if (cssIn) {
        o.classList.add(cssIn);
      }
    }
  },

  events: {
    add: (o, evtName, evtHandler) =>
      o?.addEventListener(evtName, evtHandler, false),

    remove: (o, evtName, evtHandler) =>
      o?.removeEventListener(evtName, evtHandler, false),

    preventDefault: (e) => e?.preventDefault()
  },

  image: {
    getImageFromSpriteSheet: (imgRef, callback) => {
      // extract and cache a named image (based on URL) from the "default" spritesheet

      let ssURL = SPRITESHEET_URL;

      function ssReady(ssImg) {
        // NOTE: `imageSpriteConfig` is an external reference, generated
        // and included only in the production bundle by the build process.
        const ssConfig = imageSpriteConfig[imgRef];

        if (!ssConfig) return;

        // extract and cache.
        let extractedImg = new Image();

        let canvas = document.createElement('canvas');

        let x = ssConfig[0];
        let y = ssConfig[1];
        let w = ssConfig[2];
        let h = ssConfig[3];

        const imageName = imgRef.substring(imgRef.lastIndexOf('/') + 1);
        const scale = upscaleByName[imageName] || 1;

        const targetWidth = w * scale;
        const targetHeight = h * scale;

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        let ctx = canvas.getContext('2d', {
          useDevicePixelRatio: false,
          alpha: true
        });

        // note: no smoothing, this is a 1:1-scale copy.
        ctx.imageSmoothingEnabled = false;

        ctx.drawImage(ssImg, x, y, w, h, 0, 0, targetWidth, targetHeight);

        extractedImg.onload = () => {
          extractedImg.onload = null;
          callback?.(extractedImg);
        };

        // our newly-extracted image
        extractedImg.src = canvas.toDataURL('image/png');

        // mark in cache
        imageObjects[imgRef] = extractedImg;

        ctx = null;
        canvas = null;
      }

      // fetch, as needed
      if (imageObjects[ssURL]) {
        ssReady(imageObjects[ssURL]);
      } else {
        utils.image.load(ssURL, ssReady);
      }
    },
    getImageObject: (url = emptyURL, onload) => {
      // already in cache.
      if (imageObjects[url]) {
        onload?.();
        return imageObjects[url];
      }

      // preload, then update; canvas will ignore rendering until loaded.
      let img = new Image();
      const src = url === emptyURL ? blankImage.src : `${IMAGE_ROOT}/${url}`;

      function flipInCanvas(imgToFlip, callback) {
        let canvas = document.createElement('canvas');
        canvas.width = imgToFlip.width;
        canvas.height = imgToFlip.height;

        // note: no smoothing, this is a 1:1-scale copy.
        let ctx = canvas.getContext('2d', { alpha: true });

        // horizontal flip
        ctx.scale(-1, 1);
        ctx.drawImage(imgToFlip, canvas.width * -1, 0);

        let flippedImg = new Image();

        flippedImg.onload = () => {
          flippedImg.onload = null;
          callback?.(flippedImg);
        };

        // create a new image, don't mutate our source which may be from cache
        // e.g., spritesheet -> extracted source -> new flipped image
        flippedImg.src = canvas.toDataURL('image/png');

        ctx = null;
        canvas = null;
      }

      /**
       * Hackish special case: "virtual" flipped image URL pattern -
       * e.g., `some-sprite-flipped.png`. File does not actually exist.
       * Generate and return a flipped version of the original asset.
       */

      const flipPattern = '-flipped';

      if (src.indexOf(flipPattern) !== -1) {
        // e.g., `sprite-flipped.png` -> `sprite.png`
        const nonFlippedSrc = src.replace(flipPattern, '');

        // eligible for spritesheet?

        const shortSrc = nonFlippedSrc.substring(
          nonFlippedSrc.indexOf(IMAGE_ROOT) + IMAGE_ROOT.length
        );

        if (imageSpriteConfig?.[shortSrc]) {
          // extract from sprite, and flip.
          utils.image.getImageFromSpriteSheet(shortSrc, (nonFlippedImg) => {
            flipInCanvas(nonFlippedImg, (newImg) => {
              preloadedImageURLs[url] = true;
              // re-assign the final, flipped base64-encoded URL.
              img.src = newImg.src;
              onload?.(newImg);
            });
          });
        } else {
          // flipping a non-spritesheet asset
          // fetch the original asset, then flip and cache
          utils.image.load(nonFlippedSrc, (nonFlippedImg) => {
            flipInCanvas(nonFlippedImg, (newImg) => {
              preloadedImageURLs[url] = true;
              // re-assign the final, flipped base64-encoded URL.
              img.src = newImg.src;
              onload?.(newImg);
            });
          });
        }
      } else {
        // non-flipped asset

        // eligible for spritesheet?
        const shortSrc = src.substring(
          src.indexOf(IMAGE_ROOT) + IMAGE_ROOT.length
        );

        if (imageSpriteConfig?.[shortSrc]) {
          // spritesheet asset case
          utils.image.getImageFromSpriteSheet(shortSrc, (newImg) => {
            preloadedImageURLs[url] = src;
            // update local cache with the new base64-encoded extracted source.
            img.src = newImg.src;
          });
        } else {
          // load image directly from disk
          img.onload = () => {
            preloadedImageURLs[url] = src;
            onload?.(img);
            img.onload = null;
            img.onerror = null;
          };
          img.onerror = () => {
            // TODO: allow retry of image load in a moment?
            console.warn('Image failed to load', img.src);
            preloadedImageURLs[url] = blankImage.src;
            onload?.(img);
            img.onload = null;
            img.onerror = null;
            // reassign empty image
            img.src = blankImage.src;
          };
          img.src = src;
        }
      }

      // return new object immediately
      imageObjects[url] = img;
      return img;
    },

    load: (url, callback) => {
      if (preloadedImageURLs[url] && callback instanceof Function)
        return callback(imageObjects[url]);

      let img = new Image();

      img.onload = () => {
        preloadedImageURLs[url] = true;
        imageObjects[url] = img;
        img.onload = null;
        if (callback instanceof Function) callback(img);
      };

      // note: prefixed path.
      img.src = url.match(/data:|dist\/|image\//i)
        ? url
        : `${IMAGE_ROOT}/${url}`;
    },

    preload: (urls, callback) => {
      let loaded = 0;

      function didLoad() {
        loaded++;
        if (loaded >= urls.length && callback instanceof Function) callback?.();
      }

      urls.forEach((url) => {
        utils.image.load(url, didLoad);
      });
    }
  },

  storage: (() => {
    let data = {},
      localStorage,
      unavailable;

    // try ... catch because even referencing localStorage can cause a security exception.
    // this handles cases like incognito windows, privacy stuff, and "cookies disabled" in Firefox.

    try {
      localStorage = window.localStorage || null;
    } catch (e) {
      console.info(
        'localStorage not available, likely "cookies blocked." Game options will not be saved.'
      );
      localStorage = null;
    }

    function get(name) {
      if (!localStorage) return undefined;

      try {
        data[name] = localStorage.getItem(name);
      } catch (ignore) {
        // oh well
      }

      return data[name];
    }

    function set(name, value) {
      data[name] = value;

      if (!localStorage) return undefined;

      try {
        localStorage.setItem(name, value);
      } catch (err) {
        // oh well
        return false;
      }

      return true;
    }

    function remove(name) {
      data[name] = null;

      if (localStorage) {
        try {
          localStorage.removeItem(name);
        } catch (ignore) {
          // oh well
        }
      }
    }

    // sanity check: try to read a value.
    try {
      let version = get(LS_VERSION_KEY) || '(none)';

      if (version != LS_VERSION) {
        console.log(
          `localStorage version ${version} != ${LS_VERSION}; clearing LS and resetting.`
        );
        localStorage.clear();
        set(LS_VERSION_KEY, LS_VERSION);
      }
    } catch (e) {
      console.log('localStorage read test failed. Disabling.');
      localStorage = null;
      unavailable = true;
    }

    return {
      get,
      remove,
      set,
      unavailable
    };
  })()
};

// caches
const preloadedImageURLs = {};
const imageObjects = {};

export { utils };
