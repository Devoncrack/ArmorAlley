import { game } from '../core/Game.js';
import { utils } from '../core/utils.js';
import { common } from '../core/common.js';
import { gameType } from '../aa.js';
import {
  rndInt,
  worldWidth,
  TYPES,
  rngInt,
  rngPlusMinus,
  rng,
  oneOf,
  worldHeight,
  GAME_SPEED_RATIOED,
  ENEMY_COLOR
} from '../core/global.js';
import { playSound, sounds } from '../core/sound.js';
import { zones } from '../core/zones.js';
import { sprites } from '../core/sprites.js';
import { effects } from '../core/effects.js';
import { net } from '../core/network.js';
import { gamePrefs } from '../UI/preferences.js';

const Balloon = (options = {}) => {
  let css, data, dom, objects, radarItem, reset, exports;

  const windOffsetXMax = 3;

  function checkRespawn() {
    // odd edge case - data not always defined if destroyed at the right time?
    if (data?.canRespawn && data?.dead && !objects.bunker?.data?.dead) {
      reset();
    }
  }

  function setEnemy(isEnemy) {
    if (data.isEnemy === isEnemy) return;

    data.isEnemy = isEnemy;

    zones.changeOwnership(exports);

    // get a fresh copy, pull coords as balloon has likely been mutated.
    const img = getCanvasBalloon();
    const { width, height, frameWidth, frameHeight } = img.source;

    const isSnowing = gamePrefs.weather === 'snow';

    // update internal "facing" state
    data.facing = isEnemy ? -4 : 4;

    const animConfig = {
      sprite: {
        url: isSnowing ? 'snow/balloon_mac_snow.png' : `balloon_#.png`,
        width,
        height,
        frameWidth,
        frameHeight,
        animationDuration: 1,
        // snow version is a single sprite
        animationFrameCount: isSnowing ? 0 : 9,
        reverseDirection: isEnemy
      },
      onEnd: () => {
        data.domCanvas.ownershipAnimation = null;
      }
    };

    data.domCanvas.ownershipAnimation = common.domCanvas.canvasAnimation(
      exports,
      animConfig
    );
  }

  function attachChain(chain = null) {
    // a "circular" loop that's actually a chain. ;)
    objects.chain = chain;
    objects.chain?.attachBalloon(exports);
  }

  function detachFromBunker() {
    if (data.detached) return;

    data.detached = true;

    // and become hostile.

    if (!data.hostile) {
      data.hostile = true;
      zones.changeOwnership(exports);
    }

    // disconnect bunker <-> balloon references
    if (objects.bunker) {
      // the balloon will now "own" the chain.
      objects.bunker.nullifyBalloon();
      objects.bunker = null;
    } else {
      // if no bunker to detach, there should be no chain, either.
      attachChain();
    }

    // assign immediate wind, based on ownership.
    // just enough to be full left or right-facing.
    data.windOffsetX =
      windOffsetXMax * (data.isEnemy ? -1 : 1) * (1 / data.facingRatio + 0.01);

    checkDirection();
  }

  function die(dieOptions = {}) {
    if (data.dead) return;

    // pop!
    if (sounds.balloonExplosion) {
      playSound(sounds.balloonExplosion, exports);
      if (gamePrefs.bnb && data.isOnScreen) {
        playSound(sounds.bnb.beavisPoop, exports);
      }
    }

    data.domCanvas.dieExplosion = effects.genericExplosion(exports);
    data.domCanvas.img = null;

    effects.inertGunfireExplosion({ exports });

    effects.domFetti(exports, dieOptions.attacker);

    effects.smokeRing(exports, {
      parentVX: data.vX,
      parentVY: data.vY,
      offsetX: 3,
      offsetY: 0.01
    });

    if (gameType === 'hard' || gameType === 'extreme') {
      effects.shrapnelExplosion(data, {
        count: 3 + rngInt(3, TYPES.shrapnel),
        velocity: rngInt(4, TYPES.shrapnel)
      });
    }

    // sanity check: balloon may be almost immediately restored
    // if shot while a group of infantry are passing by the bunker,
    // so only "finish" dying if still dead.

    // radar die -> hide has its own timeout, it will check
    // the parent (i.e., this) balloon's `data.dead` before hiding.
    radarItem.die();

    data.deadTimer = common.setFrameTimeout(() => {
      data.deadTimer = null;
      data.domCanvas.dieExplosion = null;
      // sanity check: don't hide if already respawned
      if (!data.dead) return;
    }, 1000);

    zones.leaveAllZones(exports);

    data.dead = true;

    common.onDie(exports, dieOptions);

    // editor case: when destroyed, gone for good.
    if (game.objects.editor) {
      sprites.removeNodes(dom);
    }
  }

  function isOnScreenChange() {
    // ignore if still tethered
    if (!data.detached) return;

    // chains don't get `isOnScreenChange()`, typically connected to bunkers or balloons
    objects.chain?.isJerking(data.isOnScreen);
  }

  function holdWind() {
    // don't allow a change in wind / direction for 5-10 seconds.
    data.windModulus = 150 + rngInt(150, data.type);
  }

  function checkDirection() {
    if (
      (data.windOffsetX > 0 && data.direction !== 1) |
      (data.windOffsetX < 0 && data.direction !== -1)
    ) {
      // changing winds.
      data.direction *= -1;
      holdWind();
    }
    updateFacing();
  }

  function updateFacing() {
    // "facing" based on wind
    let facing;

    // limit to - / + range
    data.facing = Math.min(
      data.facingMax,
      Math.max(-data.facingMax, Math.floor(data.windOffsetX * data.facingRatio))
    );

    if (data.facing !== data.lastFacingX) {
      data.lastFacingX = data.facing;
      data.width = data.facingWidths[data.facing + data.facingMax];
      data.halfWidth = data.width / 2;
      /**
       * Update sprite position, moving up/down from center.
       * Each balloon frame is 16px tall, when scaled down.
       */
      if (data.domCanvas.img) {
        if (gamePrefs.weather === 'snow') {
          data.domCanvas.img.source.frameY = data.frameYMiddle + data.facing;
        }
        updateSprite();
      }
    }
  }

  function animate() {
    if (data.dead) {
      checkRespawn();

      data.domCanvas?.dieExplosion?.animate();

      // explosion underway: move, accounting for scroll
      if (data.deadTimer) {
        sprites.moveWithScrollOffset(exports);
        return;
      }

      // allow balloon to be "GCed" only when free-floating, separated from bunker
      return (
        data.dead &&
        !data.deadTimer &&
        (!objects.bunker || objects.bunker?.data?.dead)
      );
    }

    // not dead...

    data.domCanvas?.ownershipAnimation?.animate();

    effects.smokeRelativeToDamage(exports);

    if (!data.detached) {
      // move relative to bunker

      if (
        (data.y >= data.maxY && data.verticalDirection > 0) ||
        (data.y <= data.minY && data.verticalDirection < 0)
      ) {
        data.verticalDirection *= -1;
      }

      data.y += data.verticalDirection * GAME_SPEED_RATIOED;
    } else {
      // free-floating balloon

      data.frameCount++;

      // for network games, never change the wind.
      if (!net.active && data.frameCount % data.windModulus === 0) {
        data.windOffsetX += rngPlusMinus(1, data.type) * 0.25;
        data.windOffsetX = Math.max(
          -windOffsetXMax,
          Math.min(windOffsetXMax, data.windOffsetX)
        );

        data.windOffsetY += rngPlusMinus(1, data.type) * 0.05;
        data.windOffsetY = Math.max(-0.5, Math.min(0.5, data.windOffsetY));

        // and randomize
        data.windModulus = 32 + rndInt(32);
      }

      // if at end of world, change the wind and prevent randomization until within world limits
      // this allows balloons to drift a little over, but they will return.
      if (data.x + data.windOffsetX >= data.maxX) {
        data.frameCount = 0;
        data.windOffsetX -= 0.05;
      } else if (data.x + data.windOffsetX <= data.minX) {
        data.frameCount = 0;
        data.windOffsetX += 0.05;
      }

      // limit to screen, too
      if (data.y + data.windOffsetY >= data.maxY) {
        data.frameCount = 0;
        data.windOffsetY -= 0.1;
      } else if (data.y + data.windOffsetY <= data.minY) {
        data.frameCount = 0;
        if (data.windOffsetY <= 0.5) data.windOffsetY += 0.1;
      }

      checkDirection();

      data.x += data.windOffsetX * GAME_SPEED_RATIOED;
      data.y += data.windOffsetY * GAME_SPEED_RATIOED;

      zones.refreshZone(exports);
    }

    sprites.moveWithScrollOffset(exports);
  }

  function randomExplosionType() {
    return oneOf(['generic-explosion', 'generic-explosion-2']);
  }

  reset = () => {
    // respawn can actually happen now

    data.energy = data.energyMax;

    // restore default vertical
    data.verticalDirection = data.verticalDirectionDefault;

    // look ma, no longer dead!
    data.dead = false;

    // reset position, too
    data.y = common.bottomAlignedY(-data.height);

    radarItem.reset();

    data.canRespawn = false;

    if (data.deadTimer) {
      data.deadTimer.reset();
      data.deadTimer = null;
    }

    zones.refreshZone(exports);

    // update UI, right away?
    animate();

    // stop any animation...
    data.domCanvas.ownershipAnimation = null;

    // and reset
    data.domCanvas.img = getCanvasBalloon();

    // randomize again
    css.explodingType = randomExplosionType();

    sprites.updateEnergy(exports);

    // presumably, triggered by an infantry.
    if (sounds.chainRepair) {
      playSound(sounds.chainRepair, exports);
    }
  };

  function initDOM() {
    if (game.objects.editor) {
      dom.o = sprites.create({
        className: css.className,
        id: data.id
      });
    } else {
      dom.o = {};
    }

    sprites.moveTo(exports);
  }

  function initBalloon() {
    initDOM();

    if (!objects.bunker) {
      // ensure we're free of chain + bunker
      attachChain();
      detachFromBunker();
    }

    if (net.active) {
      // network case: set random wind only once, reduce the chance of de-sync during game.
      data.windOffsetX = rngPlusMinus(
        rng(windOffsetXMax, data.type),
        data.type
      );
      data.windOffsetY = rngPlusMinus(rng(0.33, data.type), data.type);
    }

    // TODO: review hacky "can respawn" parameter
    const canRespawn = true;

    radarItem = game.objects.radar.addItem(
      exports,
      dom.o.className,
      canRespawn
    );
  }

  objects = {
    bunker: options.bunker || null,
    chain: null
  };

  css = common.inheritCSS({
    className: TYPES.balloon,
    explodingType: randomExplosionType()
  });

  const width = 38;
  const height = 16;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // plus/minus, sprite vs. direction
  const facingMax = 4;

  // for centering over the bunker: half bunker width (if provided), minus half balloon width (local)
  const leftOffset = (options.bunker?.data?.halfWidth || 0) - halfWidth;

  data = common.inheritData(
    {
      type: TYPES.balloon,
      canRespawn: false,
      frameCount: 0,
      windModulus: 16,
      windOffsetX: 0,
      windOffsetY: 0,
      energy: 3,
      energyMax: 3,
      centerEnergyLine: true,
      direction: 0,
      detached: !objects.bunker,
      hostile: !objects.bunker, // dangerous when detached
      verticalDirection: rngPlusMinus(1, TYPES.balloon),
      verticalDirectionDefault: 1,
      facing: options.isEnemy ? -4 : 4,
      lastFacingX: null,
      facingRatio: facingMax / (windOffsetXMax * 0.75),
      frameYMiddle: 4,
      facingMax,
      // larger <- or -> to smaller o (circle) shape
      facingWidths: [38, 33, 28, 22, 15, 22, 28, 33, 38],
      width,
      height,
      halfWidth,
      halfHeight,
      deadTimer: null,
      // centering balloon over bunker (half-bunker minus half-balloon widths)
      leftOffset,
      // centering balloon on radar (which expects x to line up with bunker x)
      radarLeftOffset: -leftOffset,
      x: options.x + leftOffset,
      minX: 0,
      maxX: worldWidth,
      minY: 48,
      // don't allow balloons to fly into ground units, generally speaking
      maxY: game.objects.view.data.world.height - height - 32,
      domFetti: {
        colorType: 'yellow',
        elementCount: 20 + rndInt(40),
        startVelocity: 10 + rndInt(15),
        spread: 360
      }
    },
    options
  );

  // random Y start position, unless specified
  data.y = data.y || rngInt(data.maxY, data.type);

  dom = {
    o: null
  };

  exports = {
    animate,
    attachChain,
    data,
    detachFromBunker,
    die,
    dom,
    init: initBalloon,
    isOnScreenChange,
    objects,
    reset,
    setEnemy,
    updateSprite
  };

  function getSpriteURL() {
    const offset = data.frameYMiddle + data.facing;
    return gamePrefs.weather === 'snow'
      ? 'snow/balloon_mac_snow.png'
      : `balloon_${offset}.png`;
  }

  function updateSprite() {
    if (!data?.domCanvas?.img) return;
    data.domCanvas.img.src = utils.image.getImageObject(getSpriteURL());
  }

  function getCanvasBalloon() {
    const spriteWidth = 76;
    const spriteHeight = 288;
    const frameWidth = spriteWidth;
    const frameHeight = spriteHeight / 9;

    return {
      src: utils.image.getImageObject(getSpriteURL()),
      source: {
        x: 0,
        y: 0,
        is2X: true,
        width: spriteWidth,
        height: spriteHeight,
        frameWidth,
        frameHeight,
        frameX: 0,
        // left vs. right-facing offsets, snow version only
        frameY: gamePrefs.weather !== 'snow' ? 0 : data.isEnemy ? 0 : 8
      },
      target: {
        width: frameWidth / 2,
        height: frameHeight / 2
      }
    };
  }

  data.domCanvas = {
    radarItem: Balloon.radarItemConfig(exports),
    img: getCanvasBalloon()
  };

  return exports;
};

Balloon.radarItemConfig = (exports) => ({
  width: 4,
  height: 2,
  excludeFillStroke: true,
  draw: (ctx, obj, pos, width, height) => {
    // don't draw while dead - but may be respawned.
    // when first dead, timer is set - allow blinking.
    // once dead AND the timer has finished, don't draw.
    if (exports.data.dead && !exports.data.deadTimer) return;
    ctx.fillStyle =
      exports?.data?.isEnemy || exports?.data?.hostile
        ? ENEMY_COLOR
        : '#17a007';
    const left = pos.left(obj.data.left);
    const scaledWidth = pos.width(width);
    const scaledHeight = pos.height(height);
    ctx.roundRect(
      left,
      obj.data.top - scaledHeight / 2,
      // width, height, border
      scaledWidth,
      scaledHeight,
      4
    );
    ctx.fill();
    ctx.stroke();
    if (exports?.objects?.chain && !exports.objects.chain.data.dead) {
      const chainX = left + scaledWidth / 2;
      const chainY = obj.data.top + scaledHeight / 2;
      const chainHeight =
        ((exports?.objects.bunker
          ? worldHeight
          : exports.objects.chain.data.height) /
          worldHeight) *
        game.objects.radar.data.height;
      ctx.beginPath();
      ctx.strokeStyle =
        exports?.data?.isEnemy || exports?.data?.hostile
          ? ENEMY_COLOR
          : 'rgba(255, 255, 255, 0.25)';
      ctx.setLineDash([1, 2]);
      ctx.moveTo(chainX, chainY);
      ctx.lineTo(chainX, chainY + chainHeight);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
});

export { Balloon };
