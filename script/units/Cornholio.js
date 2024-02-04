import { game } from '../core/Game.js';
import { utils } from '../core/utils.js';
import { oneOf, rndInt, TYPES } from '../core/global.js';
import { common } from '../core/common.js';
import { sprites } from '../core/sprites.js';

const Cornholio = (options = {}) => {
  let css, data, dom, exports, height;

  function setVisible(visible) {
    if (data.visible === visible) return;

    data.visible = visible;

    utils.css.addOrRemove(dom.o, data.visible, css.visible);
  }

  function setActiveSound(sound, turretFiring = null) {
    // if sound provided, we are speaking.
    // otherwise, rely on provided "turret firing" state.
    setSpeaking(sound ? true : !!turretFiring);
  }

  function setSpeaking(speaking) {
    if (data.speaking === speaking) return;

    data.speaking = speaking;

    if (speaking) {
      data.domCanvas.img.source.frameX = 1 + rndInt(2);
    } else {
      data.domCanvas.img.source.frameX = 0;
    }

    if (data.speaking) {
      data.lastSpeaking = oneOf(css.speaking);
    }

    utils.css.addOrRemove(dom.o, speaking, data.lastSpeaking);
  }

  function animate() {
    if (!data.visible) return;

    sprites.moveWithScrollOffset(exports);
  }

  function initDOM() {
    const isEnemy = data.isEnemy ? css.enemy : false;

    if (game.objects.editor) {
      dom.o = sprites.create({
        className: css.className,
        isEnemy
      });

      dom.oSubSprite = sprites.makeSubSprite();
      dom.o.appendChild(dom.oSubSprite);
    } else {
      dom.o = {};
    }
  }

  height = 33.6;

  css = common.inheritCSS({
    className: TYPES.cornholio,
    cornholio: 'cornholio',
    visible: 'visible',
    speaking: ['threatening', 'bow-down']
  });

  data = common.inheritData(
    {
      type: TYPES.cornholio,
      bottomAligned: true,
      width: 12,
      height,
      visible: null,
      lastSpeaking: null,
      lastSound: null,
      x: options.x || 0,
      y: game.objects.view.data.world.height - height - 2
    },
    options
  );

  const spriteWidth = 90;
  const spriteHeight = 84;
  const frameWidth = spriteWidth / 3;
  const frameHeight = 84;

  data.domCanvas = {
    img: {
      src: !game.objects.editor
        ? utils.image.getImageObject('beavis-cornholio.png')
        : null,
      source: {
        x: 0,
        y: 0,
        is2X: true,
        width: spriteWidth,
        height: spriteHeight,
        frameWidth,
        frameHeight,
        frameX: 0,
        frameY: 0
      },
      target: {
        width: spriteWidth / 2,
        height: frameHeight / 2
      }
    }
  };

  dom = {
    o: null,
    oSubSprite: null
  };

  exports = {
    animate,
    data,
    dom,
    hide: () => setVisible(false),
    init: initDOM,
    show: () => setVisible(true),
    setActiveSound,
    setSpeaking
  };

  return exports;
};

export { Cornholio };
