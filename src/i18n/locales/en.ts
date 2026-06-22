import type { Messages } from '../messages'

// English (en) — international fallback. Typed as Messages, so TS fails the build if
// any key from pt.ts is missing here.
export const en: Messages = {
  // — common —
  'common.back': 'BACK',
  'common.continue': 'CONTINUE',
  'common.exit': 'EXIT',
  'common.pause': 'PAUSE',

  // — main menu (arcade English) —
  'menu.start': 'PRESS START',
  'menu.coop': 'CO-OP ONLINE',
  'menu.topTen': 'TOP 10',
  'menu.options': 'OPTIONS',

  // — how to play —
  'howto.title': 'HOW TO PLAY',
  'howto.touchToContinue': 'TAP TO CONTINUE',
  'howto.movement': 'MOVEMENT',
  'howto.joystick': 'JOYSTICK',
  'howto.attack': 'ATTACK',
  'howto.punch': 'PUNCH',
  'howto.kick': 'KICK',
  'howto.defense': 'DEFENSE',
  'howto.block': 'BLOCK',
  'howto.system': 'SYSTEM',
  'howto.pause': 'PAUSE',
  'howto.mute': 'MUTE',
  'howto.mission': 'MISSION: PROTECT THE WAND FROM ENEMIES!',

  // — select fighter —
  'select.title': 'CHOOSE YOUR FIGHTER',
  'select.statReach': 'REACH',
  'select.statSpeed': 'SPEED',
  'select.statDefense': 'DEFENSE',
  'select.special': 'SPECIAL',
  'select.knockedOut': 'KNOCKED\nOUT',

  // — HUD —
  'hud.special': 'SPECIAL',
  'hud.recovering': '⚠ RECOVERING...',
  'hud.enemies': 'ENEMIES',
  'hud.waveComplete': '✓ WAVE COMPLETE!',
  'hud.bossWave': '⚠  BOSS WAVE!',
  'hud.soundOff': 'SOUND OFF',
  'hud.soundOn': 'SOUND ON',
  'hud.downTitle': 'YOU ARE DOWN',
  'hud.downSub': 'wait for the match to end',
  'hud.allyDown': 'DOWN',
  'hud.allyOff': 'OFF',
  'tip.ctxBlock': 'HOLD [L] TO BLOCK!',
  'tip.ctxDefend': 'DEFEND THE WAND! HE\'S UNDER ATTACK!',
  'tip.ctxCounter': 'ENEMY STAGGERED — COUNTER NOW!',

  // — pause menu —
  'pause.muteHint': 'MUTE (M)',

  // — in-game net / status overlays —
  'net.reconnecting': 'Reconnecting...',
  'net.reconnectingWait': 'Please wait, trying to reconnect...',
  'net.connectionLost': 'CONNECTION LOST',
  'net.returningToMenu': 'Returning to menu...',
  'net.serverUnavailable': 'Server unavailable (offline mode)',
  'game.ringClear': 'RING CLEAR',
  'game.missionComplete': 'MISSION COMPLETE',

  // — game over / continue —
  'over.continueQ': 'CONTINUE?',
  'over.yesAd': 'YES (WATCH AD)',
  'over.yesContinue': 'YES (CONTINUE)',
  'over.noBackToStart': 'NO (BACK TO START)',
  'over.adNotCompleted': 'Ad not completed',

  // — result panel labels —
  'result.score': 'SCORE',
  'result.enemies': 'ENEMIES',
  'result.time': 'TIME',
  'result.continues': 'CONTINUES',
  'result.wave': 'WAVE',

  // — you win / score submit —
  'youwin.enterName': 'ENTER YOUR NAME:',
  'youwin.teamName': 'TEAM NAME:',
  'youwin.hostWillSave': 'THE HOST WILL SAVE THE TEAM SCORE',
  'youwin.pressStart': '> PRESS START <',
  'youwin.saving': 'SAVING...',
  'youwin.cheatNotSaved': 'CHEAT — NOT SAVED',
  'youwin.teamSavedByHost': 'TEAM SCORE SAVED BY HOST',
  'youwin.offlineNotSaved': 'NO CONNECTION — NOT SAVED',
  'youwin.saved': 'SAVED!',
  'youwin.saveError': 'ERROR SAVING SCORE',
  'youwin.share': 'SHARE',
  'youwin.skip': 'SKIP >',

  // — top ten / leaderboard —
  'topten.title': 'TOP 10',
  'topten.multiplatform': 'MULTIPLATFORM',
  'topten.gameCenter': 'GAME CENTER',
  'topten.solo': 'SOLO',
  'topten.coop': 'CO-OP',
  'topten.colName': 'NAME',
  'topten.colTeam': 'TEAM',
  'topten.colCharacter': 'CHARACTER',
  'topten.colContinues': 'CONT.',
  'topten.errorLoading': 'ERROR LOADING\nRANKING',
  'topten.empty': 'NO SCORES\nYET',
  'topten.pressStart': '> PRESS START <',
  'topten.gcLogin': 'SIGN IN TO GAME CENTER\nIN SETTINGS → GAME CENTER',
  'topten.gcUnavailable': 'GAME CENTER UNAVAILABLE',

  // — lobby / co-op rooms —
  'lobby.beta': 'BETA',
  'lobby.createRoom': 'CREATE ROOM',
  'lobby.premiumGate': 'To create a room you need the premium edition of the app or to watch a quick ad.',
  'lobby.knowPremium': 'GET THE PREMIUM EDITION',
  'lobby.watchAd': 'WATCH AN AD',
  'lobby.joinWithCode': 'JOIN WITH CODE',
  'lobby.roomCode': 'ROOM CODE',
  'lobby.roomCodeColon': 'ROOM CODE:',
  'lobby.share': 'SHARE',
  'lobby.chooseFighters': 'Choose your fighters — the match starts once everyone confirms',
  'lobby.enterCodeHint': 'Enter the code and press ENTER',
  'lobby.join': 'JOIN',
  'lobby.linkCopied': 'Link copied!',
  'lobby.connecting': 'Connecting...',
  'lobby.loadingAd': 'Loading ad...',
  'lobby.serverUnavailableShort': 'Server unavailable',
  'lobby.serverUnavailableRetry': 'Server unavailable. Try again.',
  'lobby.enter4Letters': 'Enter exactly 4 letters',
  'lobby.roomNotFound': 'Room not found or server unavailable',
  'lobby.adNotCompletedRoom': 'Ad not completed — room not unlocked',

  // — co-op fighter selector —
  'coop.free': 'FREE',
  'coop.you': 'YOU',
  'coop.locked': '(locked)',
  'coop.hintMove': '← → move    ENTER confirm',
  'coop.hintChoose': '← → choose a fighter    ENTER confirm',
  'coop.hintReady': 'READY! waiting for others…    ENTER cancel',

  // — options overlay —
  'options.music': 'MUSIC',
  'options.sfx': 'SFX',
  'options.fullscreen': 'FULLSCREEN',
  'options.language': 'LANGUAGE',
  'options.on': 'ON',
  'options.off': 'OFF',
  'options.navHint': '↑↓ navigate    ENTER toggle    ESC back',

  // — web ad overlay —
  'ad.advertising': 'Advertisement',
  'ad.simulation': 'simulation',
  'ad.tagInterstitial': "THE BRAZILIAN BEAT'EM UP",
  'ad.playNow': 'PLAY NOW',
  'ad.downloadFree': 'DOWNLOAD FREE',
  'ad.rewardPrompt': 'Watch to the end to earn +1 CONTINUE',
  'ad.rewardUnlocked': 'Reward unlocked — +1 CONTINUE',
  'ad.interstitialStatus': 'Ad',
  'ad.close': 'Close',

  // — boot / loader (static HTML, localized from main.ts) —
  'boot.play': 'PLAY',
  'boot.rotate': 'Rotate your device\nto play',
}
