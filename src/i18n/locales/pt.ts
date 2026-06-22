// Portuguese (pt-BR) — the SOURCE OF TRUTH. Every key here must also exist in en.ts
// and es.ts (enforced by the `Messages` type and by tests/i18n/translate.test.ts).
//
// pt values are kept IDENTICAL to the strings the game shipped before i18n, so the
// Brazilian build does not change visually. Arcade/universal terms (PRESS START, SCORE,
// WAVE, COMBO, SPECIAL, MUTE…), brand and proper nouns stay in English in all locales.
export const pt = {
  // — common —
  'common.back': 'VOLTAR',
  'common.continue': 'CONTINUAR',
  'common.exit': 'SAIR',
  'common.pause': 'PAUSA',

  // — main menu (kept in arcade English across locales) —
  'menu.start': 'PRESS START',
  'menu.coop': 'CO-OP ONLINE',
  'menu.topTen': 'TOP 10',
  'menu.options': 'OPTIONS',

  // — how to play —
  'howto.title': 'HOW TO PLAY',
  'howto.touchToContinue': 'TOQUE PARA CONTINUAR',
  'howto.movement': 'MOVIMENTO',
  'howto.joystick': 'JOYSTICK',
  'howto.attack': 'ATAQUE',
  'howto.punch': 'SOCO',
  'howto.kick': 'CHUTE',
  'howto.defense': 'DEFESA',
  'howto.block': 'BLOQUEAR',
  'howto.system': 'SISTEMA',
  'howto.pause': 'PAUSA',
  'howto.mute': 'MUTE',
  'howto.mission': 'MISSÃO: PROTEJA O WAND DOS INIMIGOS!',

  // — select fighter —
  'select.title': 'ESCOLHA SEU LUTADOR',
  'select.statReach': 'ALCANCE',
  'select.statSpeed': 'VELOCIDADE',
  'select.statDefense': 'DEFESA',
  'select.special': 'ESPECIAL',
  'select.knockedOut': 'KNOCKED\nOUT',

  // — HUD —
  'hud.special': 'SPECIAL',
  'hud.recovering': '⚠ RECUPERANDO...',
  'hud.enemies': 'INIMIGOS',
  'hud.waveComplete': '✓ WAVE COMPLETA!',
  'hud.bossWave': '⚠  BOSS WAVE!',
  'hud.soundOff': 'SOM DESLIGADO',
  'hud.soundOn': 'SOM LIGADO',
  'hud.downTitle': 'VOCÊ CAIU',
  'hud.downSub': 'aguarde o fim da partida',
  'hud.allyDown': 'DOWN',
  'hud.allyOff': 'OFF',
  'tip.onboarding': 'PROTEJA O LUTADOR CAÍDO!\nSegure [L] para BLOQUEAR — anula o golpe e desequilibra o inimigo',

  // — pause menu —
  'pause.muteHint': 'MUTE (M)',

  // — in-game net / status overlays —
  'net.reconnecting': 'Reconectando...',
  'net.reconnectingWait': 'Aguarde, tentando reconectar...',
  'net.connectionLost': 'CONEXÃO PERDIDA',
  'net.returningToMenu': 'Voltando ao menu...',
  'net.serverUnavailable': 'Servidor indisponível (modo offline)',
  'game.ringClear': 'RING CLEAR',
  'game.missionComplete': 'MISSION COMPLETE',

  // — game over / continue —
  'over.continueQ': 'CONTINUE?',
  'over.yesAd': 'SIM (VER PROPAGANDA)',
  'over.yesContinue': 'SIM (CONTINUAR)',
  'over.noBackToStart': 'NÃO (VOLTAR AO INÍCIO)',
  'over.adNotCompleted': 'Anúncio não concluído',

  // — result panel labels (game over + you win) —
  'result.score': 'SCORE',
  'result.enemies': 'INIMIGOS',
  'result.time': 'TEMPO',
  'result.continues': 'CONTINUES',
  'result.wave': 'WAVE',

  // — you win / score submit —
  'youwin.enterName': 'ENTER YOUR NAME:',
  'youwin.teamName': 'NOME DO TIME:',
  'youwin.hostWillSave': 'O HOST VAI SALVAR A PONTUAÇÃO DO TIME',
  'youwin.pressStart': '> PRESS START <',
  'youwin.saving': 'SALVANDO...',
  'youwin.cheatNotSaved': 'CHEAT — NÃO SALVO',
  'youwin.teamSavedByHost': 'PONTUAÇÃO DO TIME SALVA PELO HOST',
  'youwin.offlineNotSaved': 'SEM CONEXÃO — NÃO SALVO',
  'youwin.saved': 'SALVO!',
  'youwin.saveError': 'ERRO AO SALVAR PONTUAÇÃO',
  'youwin.share': 'SHARE',
  'youwin.skip': 'SKIP >',

  // — top ten / leaderboard —
  'topten.title': 'TOP 10',
  'topten.multiplatform': 'MULTIPLATAFORMA',
  'topten.gameCenter': 'GAME CENTER',
  'topten.solo': 'SOLO',
  'topten.coop': 'CO-OP',
  'topten.colName': 'NOME',
  'topten.colTeam': 'TIME',
  'topten.colCharacter': 'PERSONAGEM',
  'topten.colContinues': 'CONT.',
  'topten.errorLoading': 'ERRO AO CARREGAR\nRANKING',
  'topten.empty': 'NENHUMA PONTUAÇÃO\nAINDA',
  'topten.pressStart': '> PRESS START <',
  'topten.gcLogin': 'FAÇA LOGIN NO GAME CENTER\nEM AJUSTES → GAME CENTER',
  'topten.gcUnavailable': 'GAME CENTER INDISPONÍVEL',

  // — lobby / co-op rooms —
  'lobby.beta': 'BETA',
  'lobby.createRoom': 'CRIAR SALA',
  'lobby.premiumGate': 'Para criar uma sala você precisa da edição premium do app ou assistir a uma propaganda rápida.',
  'lobby.knowPremium': 'CONHEÇA A EDIÇÃO PREMIUM',
  'lobby.watchAd': 'ASSISTIR UMA PROPAGANDA',
  'lobby.joinWithCode': 'ENTRAR COM CÓDIGO',
  'lobby.roomCode': 'CÓDIGO DA SALA',
  'lobby.roomCodeColon': 'CÓDIGO DA SALA:',
  'lobby.share': 'COMPARTILHAR',
  'lobby.chooseFighters': 'Escolham seus lutadores — a partida começa quando todos confirmarem',
  'lobby.enterCodeHint': 'Digite o código e pressione ENTER',
  'lobby.join': 'ENTRAR',
  'lobby.linkCopied': 'Link copiado!',
  'lobby.connecting': 'Conectando...',
  'lobby.loadingAd': 'Carregando propaganda...',
  'lobby.serverUnavailableShort': 'Servidor indisponível',
  'lobby.serverUnavailableRetry': 'Servidor indisponível. Tente novamente.',
  'lobby.enter4Letters': 'Insira exatamente 4 letras',
  'lobby.roomNotFound': 'Sala não encontrada ou servidor indisponível',
  'lobby.adNotCompletedRoom': 'Propaganda não concluída — sala não liberada',

  // — co-op fighter selector —
  'coop.free': 'LIVRE',
  'coop.you': 'VOCÊ',
  'coop.locked': '(travado)',
  'coop.hintMove': '← → mover    ENTER confirmar',
  'coop.hintChoose': '← → escolha um lutador    ENTER confirmar',
  'coop.hintReady': 'PRONTO! aguardando os outros…    ENTER cancelar',

  // — options overlay —
  'options.music': 'MÚSICA',
  'options.sfx': 'EFEITOS',
  'options.fullscreen': 'TELA CHEIA',
  'options.language': 'IDIOMA',
  'options.on': 'ON',
  'options.off': 'OFF',
  'options.navHint': '↑↓ navegar    ENTER alterna    ESC voltar',

  // — web ad overlay (free build, web simulation) —
  'ad.advertising': 'Publicidade',
  'ad.simulation': 'simulação',
  'ad.tagInterstitial': "O BEAT'EM UP BRASILEIRO",
  'ad.playNow': 'JOGAR AGORA',
  'ad.downloadFree': 'BAIXAR GRÁTIS',
  'ad.rewardPrompt': 'Assista até o fim para ganhar +1 CONTINUE',
  'ad.rewardUnlocked': 'Recompensa liberada — +1 CONTINUE',
  'ad.interstitialStatus': 'Anúncio',
  'ad.close': 'Fechar',

  // — boot / loader (static HTML, localized from main.ts) —
  'boot.play': 'JOGAR',
  'boot.rotate': 'Gire o dispositivo\npara jogar',
} satisfies Record<string, string>
