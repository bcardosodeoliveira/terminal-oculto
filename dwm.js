// Chamadas diretas ao DWM (dwmapi.dll) via koffi.
//
// Por que existe este arquivo: no Electron 33 uma janela `frame: false` PERDE o
// backdrop acrilico ao ser maximizada e nao o recupera ao restaurar (bugs
// upstream #41824/#42393/#46753). O que acontece por dentro:
// `ElectronDesktopWindowTreeHostWin::GetDwmFrameInsetsInPixels` zera o
// DwmExtendFrameIntoClientArea quando a janela esta maximizada, e ninguem
// restaura depois. Sem moldura estendida o DWM para de pintar o acrilico e o
// `backgroundColor: '#00000000'` acaba composto sobre PRETO.
//
// Nenhuma API do Electron resolve (testados: setBackgroundMaterial de novo,
// 'none'->'acrylic', setHasShadow, setBounds+-1, hide/showInactive). So a
// chamada direta ao DWM devolve o acrilico. De brinde, o mesmo dwmapi.dll da os
// cantos arredondados do Windows 11 (DWMWA_WINDOW_CORNER_PREFERENCE), que uma
// janela frameless tambem nao ganha sozinha.

let dwmapi = null;
let DwmExtendFrameIntoClientArea = null;
let DwmSetWindowAttribute = null;
let indisponivel = null;

const DWMWA_WINDOW_CORNER_PREFERENCE = 33;
const DWMWCP_ROUND = 2;      // cantos arredondados (o padrao do Win11)
const DWMWCP_DONOTROUND = 1; // cantos retos

function carregar() {
  if (dwmapi || indisponivel) return dwmapi;
  try {
    const koffi = require('koffi');
    koffi.struct('MARGINS', {
      cxLeftWidth: 'int', cxRightWidth: 'int',
      cyTopHeight: 'int', cyBottomHeight: 'int',
    });
    dwmapi = koffi.load('dwmapi.dll');
    // hwnd como uintptr_t (e nao void*): passamos o VALOR do handle. Se
    // declarassemos void* e mandassemos o Buffer do getNativeWindowHandle,
    // o koffi passaria o endereco do buffer, nao o handle.
    DwmExtendFrameIntoClientArea = dwmapi.func(
      'long __stdcall DwmExtendFrameIntoClientArea(uintptr_t hwnd, MARGINS *m)');
    DwmSetWindowAttribute = dwmapi.func(
      'long __stdcall DwmSetWindowAttribute(uintptr_t hwnd, uint32_t attr, _In_ uint32_t *valor, uint32_t tam)');
  } catch (e) {
    indisponivel = e; // Windows 10 antigo / koffi ausente: o app segue sem acrilico
    dwmapi = null;
  }
  return dwmapi;
}

// Le o HWND do Buffer que o Electron devolve (8 bytes no x64, 4 no x86).
function hwndDe(win) {
  const buf = win.getNativeWindowHandle();
  return buf.length === 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

// "Folha de vidro": estende a moldura por TODA a area de cliente, que e a
// condicao pro DWM pintar o acrilico ali. E isto que o Electron zera ao maximizar.
function estenderMoldura(win) {
  if (!carregar() || !win || win.isDestroyed()) return false;
  try {
    DwmExtendFrameIntoClientArea(hwndDe(win), {
      cxLeftWidth: -1, cxRightWidth: -1, cyTopHeight: -1, cyBottomHeight: -1,
    });
    return true;
  } catch { return false; }
}

// Cantos arredondados do Windows 11. O DWM ja ignora sozinho quando a janela
// esta maximizada, entao nao precisa alternar na mao.
function arredondarCantos(win, arredondar = true) {
  if (!carregar() || !win || win.isDestroyed()) return false;
  try {
    DwmSetWindowAttribute(hwndDe(win), DWMWA_WINDOW_CORNER_PREFERENCE,
      [arredondar ? DWMWCP_ROUND : DWMWCP_DONOTROUND], 4);
    return true;
  } catch { return false; }
}

// Reaplica o acrilico e mantem os cantos. Chamar em todo evento que mexe no
// tamanho: e o Chromium que zera a moldura, entao nao adianta chamar so uma vez.
function reaplicar(win) {
  estenderMoldura(win);
  arredondarCantos(win, true);
}

// CASCATA: o Chromium zera a moldura DEPOIS que o evento chega ao JS (medido —
// reaplicar so no evento 'maximize' deixa a janela preta do mesmo jeito).
// Entao reaplicamos varias vezes ao longo de meio segundo, ate depois do
// Chromium terminar de mexer. Barato: cada chamada e um DwmExtendFrameIntoClientArea.
const ATRASOS = [0, 30, 80, 160, 320, 600];
const timers = new WeakMap();

function reaplicarEmCascata(win) {
  if (!win || win.isDestroyed()) return;
  for (const t of timers.get(win) || []) clearTimeout(t);
  reaplicar(win);
  timers.set(win, ATRASOS.map((ms) => setTimeout(() => reaplicar(win), ms)));
}

// Liga os eventos de janela que disparam o zeramento da moldura.
function vigiar(win) {
  reaplicarEmCascata(win);
  for (const ev of ['maximize', 'unmaximize', 'restore', 'resize', 'resized',
                    'enter-full-screen', 'leave-full-screen', 'show', 'focus']) {
    win.on(ev, () => reaplicarEmCascata(win));
  }
  win.on('closed', () => {
    for (const t of timers.get(win) || []) clearTimeout(t);
  });
}

module.exports = { vigiar, reaplicar, estenderMoldura, arredondarCantos };
