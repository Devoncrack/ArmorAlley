import { keyboardMonitor, prefsManager } from '../aa.js';
import { debug, isFirefox, isSafari, isMobile, isiPhone, oneOf, rnd, rndInt, TYPES, tutorialMode, setTutorialMode, winloc, worldWidth, worldHeight, parseTypes } from './global.js';
import { utils } from './utils.js';
import { zones } from './zones.js';
import { common } from './common.js';
import { gamePrefs, prefs } from '../UI/preferences.js';
import { orientationChange } from '../UI/mobile.js';
import { playSound, sounds } from './sound.js';
import { Stats } from '../UI/Stats.js';
import { Joystick} from '../UI/Joystick.js';
import { View } from '../UI/View.js';
import { Inventory } from '../UI/Inventory.js';
import { Radar } from '../UI/Radar.js';
import { Tutorial } from '../UI/Tutorial.js';
import { Notifications } from '../UI/Notifications.js';
import { Queue } from './Queue.js';
import { GameLoop } from './GameLoop.js';
import { Funds } from '../UI/Funds.js';
import { Tank } from '../units/Tank.js';
import { Balloon } from '../elements/Balloon.js';
import { Bunker } from '../buildings/Bunker.js';
import { Chain } from '../elements/Chain.js';
import { MissileLauncher } from '../units/MissileLauncher.js';
import { EndBunker } from '../buildings/EndBunker.js';
import { SuperBunker } from '../buildings/SuperBunker.js';
import { Turret } from '../buildings/Turret.js';
import { Base } from '../buildings/Base.js';
import { Cloud } from '../elements/Cloud.js';
import { Helicopter } from '../units/Helicopter.js';
import { Infantry } from '../units/Infantry.js';
import { Engineer } from '../units/Engineer.js';
import { Van } from '../units/Van.js';
import { LandingPad } from '../buildings/LandingPad.js';
import { Bomb } from '../munitions/Bomb.js';
import { GunFire } from '../munitions/GunFire.js';
import { ParachuteInfantry } from '../units/ParachuteInfantry.js';
import { SmartMissile } from '../munitions/SmartMissile.js';
import { Shrapnel } from '../elements/Shrapnel.js';
import { sprites } from './sprites.js';

// very commonly-accessed attributes to be exported
let gameType;
let screenScale = 1;

const game = (() => {

  let data, dom, layoutCache = {}, objects, objectsById, objectConstructors, exports;

  function addItem(className, x, extraTransforms) {

    let data, _dom, width, height, inCache, exports;

    function initDOM() {

      _dom.o = sprites.create({
        className: `${className} terrain-item`
      });

    }
    
    function initItem() {

      initDOM();

      if (layoutCache[className]) {

        inCache = true;
        width = layoutCache[className].width;
        height = layoutCache[className].height;
  
      } else {
  
        // append to get layout (based on CSS)
        dom.battlefield.appendChild(_dom.o);
  
      }

    }

    // prefixed to avoid name conflict with parent game namespace
    // TODO: break this out into an Item class.
    _dom = {
      o: null
    };

    initItem();
    
    data = {
      type: className,
      isTerrainItem: true,
      x,
      y: 0,
      // dirty: force layout, read from CSS, and cache below
      width: width || _dom?.o?.offsetWidth,
      height: height || _dom?.o?.offsetHeight,
      isOnScreen: null,
      extraTransforms
    };

    if (!inCache) {

      // store
      layoutCache[className] = {
        width: data.width,
        height: data.height
      };

      // remove the node, now that we have its layout.
      // this will be re-appended when on-screen.
      _dom.o.remove();

    }

    // basic structure for a terrain item
    exports = {
      data,
      dom: _dom,
    };

    // these will be tracked only for on-screen / off-screen purposes.
    game.objects[TYPES.terrainItem].push(exports);

    return exports;

  }

  function addObject(type, options = {}) {

    // given type of TYPES.van, create object and append to respective array.

    let object, objectArray;

    const upper = /[A-Z]/g;

    if (upper.test(type)) {
      console.warn(`addObject(): legacy CamelCase type ${type} -> ${type.replace(upper, "-$&").toLowerCase()}`);
      // RIP this syntax. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter
      type = type.replace(upper, "-$&").toLowerCase();
    }
    
    // TYPES.van -> game.objects['van'], etc.
    objectArray = objects[type];

    // create and push an instance object onto its relevant array by type (e.g., TYPES.van -> game.objects['vans'])
    if (objectConstructors[type]) {
      object = objectConstructors[type](options);
    } else {
      console.warn(`No constructor of type ${type}`);
    }

    // add the object to game arrays, before firing init method (DOM I/O etc.)
    // hackish: `noInit` applies for inventory ordering purposes, should be refactored.

    if (!options.noInit) {

      objectArray.push(object);
  
      if (!objectsById[object.data.id]) {
        objectsById[object.data.id] = object;
      } else {
        // this shouldn't happen.
        console.warn('objectsById: already assigned?', object.data.id);
      }

      object?.init?.();

      // and caculate the zone, which will further map things.
      zones.refreshZone(object);

    }

    return object;

  }

  function createObjects() {

    let i, x;

    objects.stats = Stats();

    objects.gameLoop = GameLoop();

    objects.notifications = Notifications();

    objects.funds = Funds();

    objects.queue = Queue();

    objects.view = View();

    // hackish: now, assign the thing being exported from this module to everywhere else via `aa.js`
    screenScale = objects.view.data.screenScale;

    // allow joystick if in debug mode (i.e., testing on desktop)
    if (isMobile || debug) {

      objects.joystick = Joystick();

      objects.joystick.onSetDirection = (directionX, directionY) => {
        // percentage to pixels (circle coordinates)
        objects.view.data.mouse.x = ((directionX / 100) * objects.view.data.browser.width);
        objects.view.data.mouse.y = ((directionY / 100) * objects.view.data.browser.height);
      };

    } else {

      document.getElementById('mobile-controls').remove();
      document.getElementById('pointer').remove();

    }

    objects.radar = Radar();

    objects.inventory = Inventory();

    // tutorial?

    if (tutorialMode) {

      objects.tutorial = Tutorial();

      utils.css.add(document.getElementById('help'), 'active');

    } else {

      utils.css.add(document.getElementById('help'), 'inactive');

      document.getElementById('tutorial').remove();

    }

    // player's landing pad

    addObject(TYPES.landingPad, {
      name: 'THE LANDING PAD',
      x: 300
    });

    addItem('right-arrow-sign', -48);

    addObject(TYPES.base, {
      x: 160
    });

    addObject(TYPES.base, {
      x: 8000,
      isEnemy: true
    });

    // local, and enemy base end bunkers

    addObject(TYPES.endBunker);

    addObject(TYPES.endBunker, {
      isEnemy: true
    });

    if (gameType === 'hard' || gameType === 'extreme') {

      // "level 9"

      // mid and end-level landing pad. create up-front, since vans rely on it for xGameOver.

      addObject(TYPES.landingPad, {
        name: 'THE MIDWAY',
        x: 3944
      });

      addObject(TYPES.landingPad, {
        name: 'THE DANGER ZONE',
        x: 7800
      });

      // twin enemy turrets, mid-field - good luck. 😅
      if (gameType === 'extreme') {
        addObject(TYPES.turret, {
          x: 3800,
          isEnemy: true
        });
        addObject(TYPES.turret, {
          x: 4145,
          isEnemy: true
        });
      }

      // prototype, maybe shows only around Thanksgiving
      // when The Great Pumpkin is anticipated!
      /*
      addObject(TYPES.flyingAceCamel, {
        x: -192
      });
      */

      addItem('tree', 505);

      addItem('right-arrow-sign', 550);

      x = 630;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 230;

      addItem('grave-cross', x);

      x += 12;

      addItem('cactus2', x);

      x += 92;

      addObject(TYPES.turret, {
        x,
        isEnemy: true,
        DOA: false
      });

      x += 175;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 100;

      addObject(TYPES.tank, {
        x,
        isEnemy: true
      });

      addItem('grave-cross', x);

      x += 40;

      addItem('cactus', x);

      x += 250;

      addObject(TYPES.tank, {
        x,
        isEnemy: true
      });

      x += 50;

      addObject(TYPES.tank, {
        x,
        isEnemy: true
      });

      x += 80;

      for (i = 0; i < 10; i++) {

        addObject(TYPES.infantry, {
          x: x + (i * 11),
          isEnemy: true
        });

      }

      addObject(TYPES.van, {
        x: x + 210,
        isEnemy: true
      });

      addItem('gravestone', x);

      x += 110;

      addObject(TYPES.superBunker, {
        x,
        isEnemy: true,
        energy: 5
      });

      x += 120;

      addObject(TYPES.turret, {
        x,
        isEnemy: true,
        DOA: false
      });

      x += 640;

      addItem('gravestone', x);

      addObject(TYPES.van, {
        x,
        isEnemy: true
      });

      for (i = 0; i < 5; i++) {

        addObject(TYPES.infantry, {
          x: (x + 50) + (i * 11),
          isEnemy: true
        });

      }

      x += 80;

      addItem('sand-dunes', x);

      addObject(TYPES.tank, {
        x: x + 75,
        isEnemy: true
      });

      for (i = 0; i < 5; i++) {

        addObject(TYPES.infantry, {
          x: (x + 75) + (i * 11),
          isEnemy: true
        });

      }

      addObject(TYPES.tank, {
        x: x + 240,
        isEnemy: true
      });

      x += 540;

      addObject(TYPES.tank, {
        x,
        isEnemy: true
      });

      addObject(TYPES.tank, {
        x: x + 240,
        isEnemy: true
      });

      for (i = 0; i < 5; i++) {

        addObject(TYPES.infantry, {
          x: (x + 240 + 75) + (i * 11),
          isEnemy: true
        });

      }

      addObject(TYPES.van, {
        x: x + 240 + 215,
        isEnemy: true
      });

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 135;

      addItem('gravestone', x);

      x += 25;

      addItem('cactus2', x);

      x += 260;

      addItem('sand-dune', x);

      x -= 40;

      addItem('grave-cross', x);

      x += 150;

      addItem('sand-dunes', x);

      x += 150;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 115;

      // landing pad is logically added here.

      x += 88;

      // gravestone sits behind...

      x += 10;

      addItem('gravestone', x);

      x -= 10;

      // now, stack on top

      addItem('sand-dune', x);

      addItem('grave-cross', x);

      x += 54;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x -= 6;

      addItem('checkmark-grass', x);

      x += 90;

      addItem('cactus', x);

      x += 305;

      addItem('gravestone', x);

      x += 32;

      addItem('grave-cross', x);

      x += 80;

      addItem('sand-dune', x);

      x += 115;

      addItem('grave-cross', x);

      x += 175;

      addItem('gravestone', x);

      x += 55;

      addItem('cactus2', x);

      x += 85;

      addItem('gravestone', x);

      x += 25;

      addItem('grave-cross', x);

      x += 70;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 5;

      addItem('gravestone', x);

      x += 85;

      addItem('gravestone', x);

      x += 192;

      addItem('gravestone', x);

      x += 96;

      addItem('gravestone', x);

      x += 150;

      addItem('grave-cross', x);

      x += 50;

      addItem('gravestone', x);

      x += 260;

      addItem('gravestone', x);

      x += 45;

      addItem('sand-dunes', x);

      x += 215;

      addItem('cactus2', x);

      x += 60;

      addObject(TYPES.superBunker, {
        x,
        isEnemy: true,
        energy: 5
      });

      x += 125;

      addObject(TYPES.turret, {
        x,
        isEnemy: true,
        DOA: false
      });

      x += 145;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 128;

      addObject(TYPES.bunker, {
        x,
        isEnemy: true
      });

      x += 20;

      addItem('grave-cross', x);

      x += 64;

      addItem('cactus2', x);

      x += 50;

      addItem('gravestone', x);

      x += 200;

      addItem('gravestone', x);

      x += 115;

      addItem('cactus', x);

      x += 42;

      addItem('grave-cross', x);

      x += 140;

      addItem('cactus2', x);

      x += 12;

      addItem('cactus2', x);

      x += 100;

      addItem('gravestone', x);

      x += 145;

      // ideally, this should be between the right post sign now.

      addItem('grave-cross', x);

    } else {

      // level 1

      // mid and end-level landing pads (affects van objects' xGameOver property, so create this ahead of vans.)

      addObject(TYPES.landingPad, {
        name: 'THE MIDWAY',
        x: 4096 - 290
      });

      addObject(TYPES.landingPad, {
        name: 'THE DANGER ZONE',
        isKennyLoggins: true,
        x: 7800
      });

      addObject(TYPES.turret, {
        x: 475,
        DOA: true
      });

      addObject(TYPES.bunker, {
        x: 1024,
        isEnemy: true
      });

      addItem('tree', 660);

      addItem('palm-tree', 860);

      addItem('barb-wire', 918);

      addItem('palm-tree', 1120);

      addItem('rock2', 1280);

      addItem('palm-tree', 1390);

      addObject(TYPES.bunker, {
        x: 1536
      });

      addItem('palm-tree', 1565);

      addItem('flower', 1850);

      addObject(TYPES.bunker, {
        x: 2048
      });

      addItem('tree', 2110);

      addItem('gravestone', 2150);

      addItem('palm-tree', 2260);

      addItem('tree', 2460);

      addObject(TYPES.bunker, {
        x: 2560
      });

      addItem('tree', 2700);

      addObject(TYPES.bunker, {
        x: 3072
      });

      addItem('palm-tree', 3400);

      addItem('palm-tree', 3490);

      addItem('checkmark-grass', 4120);

      addItem('palm-tree', 4550);

      addObject(TYPES.bunker, {
        x: 4608,
        isEnemy: true
      });

      addItem('tree', 4608);

      addItem('tree', 4820);

      addItem('palm-tree', 4850);

      addItem('grave-cross', 4970);

      addObject(TYPES.bunker, {
        x: 5120,
        isEnemy: true
      });

      addItem('tree', 5110);

      addItem('barb-wire', 5200);

      addItem('grave-cross', 5275);

      addObject(TYPES.bunker, {
        x: 5632,
        isEnemy: true
      });

      // near-end / enemy territory

      addItem('palm-tree', 3932 + 32);

      addItem('tree', 3932 + 85);

      addItem('palm-tree', 3932 + 85 + 230);

      addItem('tree', 3932 + 85 + 230 + 90);

      addObject(TYPES.bunker, {
        x: 6656,
        isEnemy: true
      });

      addItem('tree', 6736);

      addItem('tree', 6800);

      addItem('palm-tree', 6888);

      addItem('gravestone', 7038);

      addItem('tree', 7070);

      addItem('gravestone', 7160);

      addItem('palm-tree', 7310);

      addItem('tree', 7325);

      addItem('flower', 7500);

      // more mid-level stuff

      addObject(TYPES.superBunker, {
        x: 4096 - 640 - 128,
        isEnemy: true,
        energy: 5
      });

      addObject(TYPES.turret, {
        x: 4096 - 640, // width of landing pad
        isEnemy: true,
        DOA: !!tutorialMode
      });

      addObject(TYPES.turret, {
        x: 4096 + 120, // width of landing pad
        isEnemy: true,
        DOA: !!tutorialMode
      });

      // vehicles!

      if (!winloc.match(/novehicles/i) && !tutorialMode) {

        // friendly units

        addObject(TYPES.van, {
          x: 192
        });

        for (i = 0; i < 5; i++) {

          addObject(TYPES.infantry, {
            x: 600 + (i * 20)
          });

        }

        addObject(TYPES.van, {
          x: 716
        });

        addObject(TYPES.tank, {
          x: 780
        });

        addObject(TYPES.tank, {
          x: 845
        });

        // first enemy convoy

        addObject(TYPES.tank, {
          x: 1536,
          isEnemy: true
        });

        addObject(TYPES.tank, {
          x: 1536 + 70,
          isEnemy: true
        });

        addObject(TYPES.tank, {
          x: 1536 + 140,
          isEnemy: true
        });

        addObject(TYPES.van, {
          x: 1536 + 210,
          isEnemy: true
        });

        addObject(TYPES.tank, {
          x: 2048 + 256,
          isEnemy: true
        });

        addObject(TYPES.tank, {
          x: 4608 + 256,
          isEnemy: true
        });

        for (i = 0; i < 5; i++) {

          // enemy infantry, way out there
          addObject(TYPES.infantry, {
            x: 5120 + (i * 20),
            isEnemy: true
          });

        }

      }

    }

    // happy little clouds!

    addObject(TYPES.cloud, {
      x: 512
    });

    addObject(TYPES.cloud, {
      x: 4096 - 256
    });

    addObject(TYPES.cloud, {
      x: 4096 + 256
    });

    addObject(TYPES.cloud, {
      x: 4096 + 512
    });

    addObject(TYPES.cloud, {
      x: 4096 + 768
    });

    // a few rogue balloons

    addObject(TYPES.balloon, {
      x: 4096 - 256,
      y: rnd(worldHeight)
    });

    addObject(TYPES.balloon, {
      x: 4096 + 256,
      y: rnd(worldHeight)
    });

    addObject(TYPES.balloon, {
      x: 4096 + 512,
      y: rnd(worldHeight)
    });

    addObject(TYPES.balloon, {
      x: 4096 + 768,
      y: rnd(worldHeight)
    });

    // enemy base signs (flipped via `extraTransform`)

    addItem('left-arrow-sign', 7700, 'scaleX(-1)');

    addItem('left-arrow-sign', 8192 + 16, 'scaleX(-1)');

    // player + enemy helicopters

    addObject(TYPES.helicopter, {
      attachEvents: true
    });

    if (!tutorialMode) {

      addObject(TYPES.helicopter, {
        isEnemy: true
      });

    }

  }

  function togglePause() {

    if (data.paused) {
      resume();
    } else {
      pause();
    }

  }

  function pause() {

    if (data.paused) return;

    // good time to process the queue - prune the DOM, etc.
    if (objects.queue) {
      objects.queue.process();
    }

    objects.gameLoop.stop();

    if (gamePrefs.sound && window.soundManager) {
      window.soundManager.mute();
    }

    // shuffle "resume prompts" messages by hiding all except one; hopefully, they're considered humorous. ;)
    let prompts = document.querySelectorAll('#game-paused .resume-prompt');
    let rnd = rndInt(prompts.length);

    for (let i = 0; i < prompts.length; i++) {
      prompts[i].style.display = (i === rnd ? 'inline-block' : 'none');
    }

    let css = ['game-paused'];
    
    // don't show paused status / tips in certain cases

    if (prefsManager.isActive()) {
      css.push('prefs-modal-open');
    }

    if (!gameType) {
      css.push('game-menu-open');
    }

    utils.css.add(document.body, ...css);

    data.paused = true;

  }

  function resume() {

    // exit if preferences menu is open; it will handle resume on close.
    if (prefsManager.isActive()) return;

    if (!data.paused) return;

    objects.gameLoop.start();

    if (gamePrefs.sound && window.soundManager) {
      window.soundManager.unmute();
    }

    utils.css.remove(document.body, 'game-paused', 'prefs-modal-open', 'game-menu-open');

    data.paused = false;

  }

  // when the player has chosen a game type - tutorial, easy/hard/extreme.
  function init() {

    data.convoyDelay = gameType === 'extreme' ? 20 : (gameType === 'hard' ? 30 : 60);

    createObjects();

    objects.gameLoop.init();

    function startEngine() {

      // wait until available
      if (!sounds.helicopter.engine) return;

      playSound(sounds.helicopter.engine);
      utils.events.remove(document, 'click', startEngine);

    }

    if (gamePrefs.sound) {
      // wait for click or keypress, "user interaction"
      utils.events.add(document, 'click', startEngine);
    }

    (() => {

      // basic enemy ordering pattern
      const enemyOrders = parseTypes('missileLauncher, tank, van, infantry, infantry, infantry, infantry, infantry, engineer, engineer');
      const enemyDelays = [4, 4, 3, 0.4, 0.4, 0.4, 0.4, 1, 0.45];
      let i = 0;

      if (gameType === 'extreme') {

        // one more tank to round out the bunch, and (possibly) further complicate things :D
        enemyOrders.push(TYPES.tank);

        // matching delay, too
        enemyDelays.push(4);

      }

      // after ordering, wait a certain amount before the next convoy
      enemyDelays.push(data.convoyDelay);

      function orderNextItem() {

        let options;

        if (!data.battleOver && !data.paused) {

          options = {
            isEnemy: true,
            x: worldWidth + 64
          };

          if (!data.productionHalted) {
            addObject(enemyOrders[i], options);
          }

          common.setFrameTimeout(orderNextItem, enemyDelays[i] * 1000);

          i++;

          if (i >= enemyOrders.length) {
            i = 0;
          }

        }

      }

      // and begin
      if (!tutorialMode) {
        common.setFrameTimeout(orderNextItem, 5000);
      }

    })();

  }

  // the home screen: choose a game type.
  function initArmorAlley() {

    // A few specific CSS tweaks - regrettably - are required.
    if (isFirefox) utils.css.add(document.body, 'is_firefox');
    if (isSafari) utils.css.add(document.body, 'is_safari');
  
    if (isMobile) {
  
      utils.css.add(document.body, 'is-mobile');
  
      // prevent context menu on links.
      // this is dirty, but it works (supposedly) for Android.
      window.oncontextmenu = e => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
  
      // if iPads etc. get The Notch, this will need updating. as of 01/2018, this is fine.
      if (isiPhone) {
        /**
         * iPhone X notch detection shenanigans. AA should avoid the notch,
         * but doesn't need to pad the right end of the screen - thus, we detect
         * this case and apply CSS for orientation so we know which side the notch is on.
         *
         * Tips o' the hat:
         * PPK - hasNotch() detection. Doesn't seem to work on iOS 11.0.2 as of 01/2018.
         * https://www.quirksmode.org/blog/archives/2017/10/safeareainset_v.html
         * Mark Nolton on SO - orientation change.
         * https://stackoverflow.com/a/47226825
         */
        console.log('watching orientation for possible iPhone X Notch handling.');
        window.addEventListener('orientationchange', orientationChange);
        // and get the current layout.
        orientationChange();
      }
  
    }
  
    // TODO: clean up this mess. :P
    let menu;

    const description = document.getElementById('game-description');
    const defaultDescription = description.innerHTML;
    let lastHTML = defaultDescription;
  
    function resetMenu() {
      if (lastHTML !== defaultDescription) {
        description.innerHTML = defaultDescription;
        lastHTML = defaultDescription;
      }
    }
  
    function menuUpdate(e) {
  
      let target = (e.target || window.event.sourceElement), title;
  
      // normalize to <a>
      if (target && utils.css.has(target, 'emoji')) {
        target = target.parentNode;
      }
  
      if (target && target.className.match(/cta/i)) {
        title = target.title;
        if (title) {
          target.setAttribute('data-title', title);
          target.title = '';
        } else {
          title = target.getAttribute('data-title');
        }
        if (lastHTML !== title) {
          description.innerHTML = title;
          lastHTML = title;
        }
      } else {
        resetMenu();
      }
  
    }
  
    function menuClick(e) {
      // infer game type from link, eg., #tutorial
  
      const target = (e.target || window.event.sourceElement);
  
      let storedOK;
      let param;
  
      if (target && target.href) {
  
        // cleanup
        utils.events.remove(menu, 'click', menuClick);
        utils.events.remove(menu, 'mouseover', menuUpdate);
        utils.events.remove(menu, 'mouseout', menuUpdate);
        menu = null;
  
        param = target.href.substr(target.href.indexOf('#') + 1);
  
        if (param === 'easy') {
  
          // window.location.hash = param;
  
          // set local storage value, and continue
          storedOK = utils.storage.set(prefs.gameType, 'easy');
  
          // stoage failed? use hash, then.
          if (!storedOK) {
            window.location.hash = param;
          }
  
          if (gameType === 'hard' || gameType === 'extreme') {
  
            // reload, since we're switching to easy
            window.location.reload();
  
          } else {
  
            // show exit link
            const exit = document.getElementById('exit');
            if (exit) {
              exit.className = 'visible';
            }
  
          }
  
        } else if (param === 'hard' || param === 'extreme') {
  
          // set local storage value, and continue
          storedOK = utils.storage.set(prefs.gameType, param);
  
          // stoage failed? use hash, then.
          if (!storedOK) {
            window.location.hash = param;
          }
  
          window.location.reload();
  
        } else {
  
          window.location.hash = 'tutorial';
  
          window.location.reload();
  
        }
  
      }
  
      utils.events.preventDefault(e);
  
      data.canHideLogo = true;
  
      return false;
    }

    // TODO: DOM init method or similar, ideally
    
    dom.world = document.getElementById('world');
    dom.battlefield = document.getElementById('battlefield');

    // should we show the menu?
  
    gameType = (winloc.match(/easy|hard|extreme|tutorial/i) || utils.storage.get(prefs.gameType));
  
    if (gameType instanceof Array) {
      gameType = gameType[0];
    }
  
    // safety check
    if (gameType && !gameType.match(/easy|hard|extreme|tutorial/i)) {
      gameType = null;
    }
  
    if (!gameType) {
     
      menu = document.getElementById('game-menu');
 
      if (menu) {

        utils.css.add(dom.world, 'blurred');
  
        utils.css.add(menu, 'visible');
  
        utils.events.add(menu, 'click', menuClick);
  
        utils.events.add(menu, 'mouseover', menuUpdate);
  
        utils.events.add(menu, 'mouseout', menuUpdate);
  
      }
  
    } else {
  
      // preference set or game type in URL - start immediately.
  
      if (gameType.match(/easy|hard|extreme/i)) {
        utils.css.add(dom.world, 'regular-mode');
      }
  
      if (gameType) {

        // copy emoji to "exit" link
        const exitEmoji = document.getElementById('exit-emoji');

        let emojiReference = document.getElementById('game-menu').getElementsByClassName(`emoji-${gameType}`);
        emojiReference = emojiReference && emojiReference[0];

        if (exitEmoji && emojiReference) {
          exitEmoji.innerHTML = emojiReference.innerHTML;
        }

        // and show "exit"
        const exit = document.getElementById('exit');

        if (exit) {
          exit.className = 'visible';
        }
        
        // hackish: remove green overlay
        document.getElementById('world-overlay').style.background = 'transparent';

      }
  
      data.canHideLogo = true;
  
    }
  
    game.init();
  
    prefsManager.init();
  
  }

  data = {
    battleOver: false,
    canHideLogo: false,
    convoyDelay: 60,
    paused: false,
    productionHalted: false
  };

  dom = {
    battlefield: null,
    world: null
  };

  objects = {
    gameLoop: null,
    view: null,
    chain: [],
    balloon: [],
    bomb: [],
    bunker: [],
    cornholio: [],
    domFetti: [],
    ephemeralExplosion: [],
    'end-bunker': [],
    endBunker: [],
    engineer: [],
    flyingAce: [],
    gunfire: [],
    infantry: [],
    'parachute-infantry': [],
    'missile-launcher': [],
    'super-bunker': [],
    tank: [],
    van: [],
    helicopter: [],
    'smart-missile': [],
    base: [],
    cloud: [],
    'landing-pad': [],
    turret: [],
    shrapnel: [],
    smoke: [],
    'terrain-item': [],
    radar: null,
    inventory: null,
    tutorial: null,
    queue: null,
    funds: null,
    notifications: null,
    stats: null
  };

  objectsById = {};

  objectConstructors = {
    balloon: Balloon,
    base: Base,
    bomb: Bomb,
    bunker: Bunker,
    chain: Chain,
    cloud: Cloud,
    cornholio: Cornholio,
    'end-bunker': EndBunker,
    engineer: Engineer,
    // flyingAce: FlyingAce,
    gunfire: GunFire,
    helicopter: Helicopter,
    infantry: Infantry,
    'landing-pad': LandingPad,
    'missile-launcher': MissileLauncher,
    'parachute-infantry': ParachuteInfantry,
    shrapnel: Shrapnel,
    'smart-missile': SmartMissile,
    'super-bunker': SuperBunker,
    turret: Turret,
    tank: Tank,
    van: Van
  };

  exports = {
    addItem,
    addObject,
    data,
    dom,
    init,
    initArmorAlley,
    objects,
    objectsById,
    pause,
    resume,
    togglePause
  };

  return exports;

})();

export { game, gameType, screenScale };