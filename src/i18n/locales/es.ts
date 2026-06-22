import type { Messages } from '../messages'

// Spanish (es) — LatAm + Spain. Typed as Messages, so TS fails the build if any key
// from pt.ts is missing here.
export const es: Messages = {
  // — common —
  'common.back': 'ATRÁS',
  'common.continue': 'CONTINUAR',
  'common.exit': 'SALIR',
  'common.pause': 'PAUSA',

  // — main menu (arcade English) —
  'menu.start': 'PRESS START',
  'menu.coop': 'CO-OP ONLINE',
  'menu.topTen': 'TOP 10',
  'menu.options': 'OPTIONS',

  // — how to play —
  'howto.title': 'HOW TO PLAY',
  'howto.touchToContinue': 'TOCA PARA CONTINUAR',
  'howto.movement': 'MOVIMIENTO',
  'howto.joystick': 'JOYSTICK',
  'howto.attack': 'ATAQUE',
  'howto.punch': 'PUÑO',
  'howto.kick': 'PATADA',
  'howto.defense': 'DEFENSA',
  'howto.block': 'BLOQUEAR',
  'howto.system': 'SISTEMA',
  'howto.pause': 'PAUSA',
  'howto.mute': 'MUTE',
  'howto.mission': '¡MISIÓN: PROTEGE A WAND DE LOS ENEMIGOS!',

  // — select fighter —
  'select.title': 'ELIGE TU LUCHADOR',
  'select.statReach': 'ALCANCE',
  'select.statSpeed': 'VELOCIDAD',
  'select.statDefense': 'DEFENSA',
  'select.special': 'ESPECIAL',
  'select.knockedOut': 'KNOCKED\nOUT',

  // — HUD —
  'hud.special': 'SPECIAL',
  'hud.recovering': '⚠ RECUPERANDO...',
  'hud.enemies': 'ENEMIGOS',
  'hud.waveComplete': '✓ ¡WAVE COMPLETA!',
  'hud.bossWave': '⚠  BOSS WAVE!',
  'hud.soundOff': 'SONIDO APAGADO',
  'hud.soundOn': 'SONIDO ACTIVO',
  'hud.downTitle': 'HAS CAÍDO',
  'hud.downSub': 'espera el fin de la partida',
  'hud.allyDown': 'DOWN',
  'hud.allyOff': 'OFF',
  'tip.ctxBlock': '¡MANTÉN [L] PARA BLOQUEAR!',
  'tip.ctxDefend': '¡DEFIENDE AL WAND! ¡LO ESTÁN ATACANDO!',
  'tip.ctxCounter': 'ENEMIGO DESEQUILIBRADO — ¡CONTRAATACA!',

  // — pause menu —
  'pause.muteHint': 'MUTE (M)',

  // — in-game net / status overlays —
  'net.reconnecting': 'Reconectando...',
  'net.reconnectingWait': 'Espera, intentando reconectar...',
  'net.connectionLost': 'CONEXIÓN PERDIDA',
  'net.returningToMenu': 'Volviendo al menú...',
  'net.serverUnavailable': 'Servidor no disponible (modo offline)',
  'game.ringClear': 'RING CLEAR',
  'game.missionComplete': 'MISSION COMPLETE',

  // — game over / continue —
  'over.continueQ': '¿CONTINUAR?',
  'over.yesAd': 'SÍ (VER ANUNCIO)',
  'over.yesContinue': 'SÍ (CONTINUAR)',
  'over.noBackToStart': 'NO (VOLVER AL INICIO)',
  'over.adNotCompleted': 'Anuncio no completado',

  // — result panel labels —
  'result.score': 'SCORE',
  'result.enemies': 'ENEMIGOS',
  'result.time': 'TIEMPO',
  'result.continues': 'CONTINUES',
  'result.wave': 'WAVE',

  // — you win / score submit —
  'youwin.enterName': 'INGRESA TU NOMBRE:',
  'youwin.teamName': 'NOMBRE DEL EQUIPO:',
  'youwin.hostWillSave': 'EL HOST GUARDARÁ LA PUNTUACIÓN DEL EQUIPO',
  'youwin.pressStart': '> PRESS START <',
  'youwin.saving': 'GUARDANDO...',
  'youwin.cheatNotSaved': 'CHEAT — NO GUARDADO',
  'youwin.teamSavedByHost': 'PUNTUACIÓN DEL EQUIPO GUARDADA POR EL HOST',
  'youwin.offlineNotSaved': 'SIN CONEXIÓN — NO GUARDADO',
  'youwin.saved': '¡GUARDADO!',
  'youwin.saveError': 'ERROR AL GUARDAR LA PUNTUACIÓN',
  'youwin.share': 'COMPARTIR',
  'youwin.skip': 'OMITIR >',

  // — top ten / leaderboard —
  'topten.title': 'TOP 10',
  'topten.multiplatform': 'MULTIPLATAFORMA',
  'topten.gameCenter': 'GAME CENTER',
  'topten.solo': 'SOLO',
  'topten.coop': 'CO-OP',
  'topten.colName': 'NOMBRE',
  'topten.colTeam': 'EQUIPO',
  'topten.colCharacter': 'PERSONAJE',
  'topten.colContinues': 'CONT.',
  'topten.errorLoading': 'ERROR AL CARGAR\nEL RANKING',
  'topten.empty': 'AÚN NO HAY\nPUNTUACIONES',
  'topten.pressStart': '> PRESS START <',
  'topten.gcLogin': 'INICIA SESIÓN EN GAME CENTER\nEN AJUSTES → GAME CENTER',
  'topten.gcUnavailable': 'GAME CENTER NO DISPONIBLE',

  // — lobby / co-op rooms —
  'lobby.beta': 'BETA',
  'lobby.createRoom': 'CREAR SALA',
  'lobby.premiumGate': 'Para crear una sala necesitas la edición premium de la app o ver un anuncio rápido.',
  'lobby.knowPremium': 'CONOCE LA EDICIÓN PREMIUM',
  'lobby.watchAd': 'VER UN ANUNCIO',
  'lobby.joinWithCode': 'UNIRSE CON CÓDIGO',
  'lobby.roomCode': 'CÓDIGO DE LA SALA',
  'lobby.roomCodeColon': 'CÓDIGO DE LA SALA:',
  'lobby.share': 'COMPARTIR',
  'lobby.chooseFighters': 'Elijan sus luchadores — la partida empieza cuando todos confirmen',
  'lobby.enterCodeHint': 'Escribe el código y pulsa ENTER',
  'lobby.join': 'UNIRSE',
  'lobby.linkCopied': '¡Enlace copiado!',
  'lobby.connecting': 'Conectando...',
  'lobby.loadingAd': 'Cargando anuncio...',
  'lobby.serverUnavailableShort': 'Servidor no disponible',
  'lobby.serverUnavailableRetry': 'Servidor no disponible. Inténtalo de nuevo.',
  'lobby.enter4Letters': 'Ingresa exactamente 4 letras',
  'lobby.roomNotFound': 'Sala no encontrada o servidor no disponible',
  'lobby.adNotCompletedRoom': 'Anuncio no completado — sala no desbloqueada',

  // — co-op fighter selector —
  'coop.free': 'LIBRE',
  'coop.you': 'TÚ',
  'coop.locked': '(bloqueado)',
  'coop.hintMove': '← → mover    ENTER confirmar',
  'coop.hintChoose': '← → elige un luchador    ENTER confirmar',
  'coop.hintReady': '¡LISTO! esperando a los demás…    ENTER cancelar',

  // — options overlay —
  'options.music': 'MÚSICA',
  'options.sfx': 'EFECTOS',
  'options.fullscreen': 'PANTALLA COMPLETA',
  'options.language': 'IDIOMA',
  'options.on': 'ON',
  'options.off': 'OFF',
  'options.navHint': '↑↓ navegar    ENTER alterna    ESC atrás',

  // — web ad overlay —
  'ad.advertising': 'Publicidad',
  'ad.simulation': 'simulación',
  'ad.tagInterstitial': "EL BEAT'EM UP BRASILEÑO",
  'ad.playNow': 'JUGAR AHORA',
  'ad.downloadFree': 'DESCARGAR GRATIS',
  'ad.rewardPrompt': 'Mira hasta el final para ganar +1 CONTINUE',
  'ad.rewardUnlocked': 'Recompensa desbloqueada — +1 CONTINUE',
  'ad.interstitialStatus': 'Anuncio',
  'ad.close': 'Cerrar',

  // — boot / loader (static HTML, localized from main.ts) —
  'boot.play': 'JUGAR',
  'boot.rotate': 'Gira tu dispositivo\npara jugar',
}
