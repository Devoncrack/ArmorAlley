import {
  common,
  inheritData,
  inheritCSS,
  makeSprite,
  collisionTest,
  rndInt,
  makeTransformSprite,
  worldHeight
} from '../aa.js';

const LandingPad = options => {

  let css, dom, data, collision, exports;

  function animate() {

    collisionTest(collision, exports);

  }

  function isOnScreenChange(isOnScreen) {
    if (!isOnScreen) return;
    setWelcomeMessage();
  }

  function setWelcomeMessage() {
    let eat, drink;

    eat = data.edible[rndInt(data.edible.length)];
    drink = data.drinkable[rndInt(data.drinkable.length)];

    data.welcomeMessage = `-* 🚁 Welcome to ${data.name}${' ⛽🛠️ *-<br>Today\'s feature: %s1 %s2 &middot; Enjoy your stay.'.replace('%s1', drink).replace('%s2', eat)}`;
  }

  function initLandingPad() {

    dom.o = makeSprite({
      className: css.className
    });

    dom.oTransformSprite = makeTransformSprite();
    dom.o.appendChild(dom.oTransformSprite);

    common.setTransformXY(exports, dom.o, `${data.x}px`, `${data.y}px`);

    setWelcomeMessage();
  }

  options = options || {};

  css = inheritCSS({
    className: 'landing-pad'
  });

  data = inheritData({
    type: 'landing-pad',
    name: options?.name,
    isNeutral: true,
    energy: 2,
    width: 81,
    height: 4,
    y: worldHeight - 3,
    edible: ['🍔', '🍑', '🍒', '🍆', '🥑', '🍄', '🍖', '🍟', '🌭', '🌮', '🌯', '🍲', '🍿', '🍣', '🐟', '🥡'],
    drinkable: ['🍺', '🍻', '🍹', '☕', '🍾', '🍷', '🍸', '🥂', '🥃']
  }, options);

  dom = {
    o: null,
    oTransformSprite: null,
  };

  collision = {
    options: {
      source: exports,
      targets: undefined,
      hit(target) {
        if (!target.onLandingPad) return;
        /**
         * slightly hackish: landing pad shape doesn't take full height of bounding box.
         * once a "hit", measure so that helicopter aligns with bottom of world.
         * 
         * additionally: only consider a "hit" IF the helicopter is moving down, e.g., data.vY > 0.
         * otherwise, ignore this event and allow helicopter to leave.
         */
        if (target.data.vY >= 0 && !target.data.dead) {
          // "friendly landing pad HIT"
          if (target.data.y + target.data.height >= worldHeight) {
            // provide the "active" landing pad
            target.onLandingPad(exports);
          }
        } else {
          // "friendly landing pad MISS"
          target.onLandingPad(false);
        }
      },
    },
    items: ['helicopters']
  };

  exports = {
    animate,
    data,
    dom,
    isOnScreenChange
  };

  initLandingPad();

  return exports;

};

export { LandingPad };