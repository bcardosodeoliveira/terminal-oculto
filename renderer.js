const { ipcRenderer } = require('electron');
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');
const { WebglAddon } = require('@xterm/addon-webgl');
const { Unicode11Addon } = require('@xterm/addon-unicode11');

// Esquema Campbell (padrao do Windows Terminal)
const campbell = {
  background: 'rgba(0, 0, 0, 0)',        // xterm 100% transparente; o tom de 80% vem do CSS (body)
  foreground: '#CCCCCC',
  cursor: '#FFFFFF',
  cursorAccent: '#0C0C0C',
  selectionBackground: '#FFFFFF44',
  black: '#0C0C0C',        brightBlack: '#767676',
  red: '#C50F1F',          brightRed: '#E74856',
  green: '#13A10E',        brightGreen: '#16C60C',
  yellow: '#C19C00',       brightYellow: '#F9F1A5',
  blue: '#0037DA',         brightBlue: '#3B78FF',
  magenta: '#881798',      brightMagenta: '#B4009E',
  cyan: '#3A96DD',         brightCyan: '#61D6D6',
  white: '#CCCCCC',        brightWhite: '#F2F2F2',
};

// numero do build do Windows (pro xterm lidar certo com o ConPTY)
let winBuild = 19045;
try { winBuild = parseInt(require('os').release().split('.')[2], 10) || 19045; } catch {}

const term = new Terminal({
  fontFamily: '"CaskaydiaCove Nerd Font Mono", "Cascadia Mono", Consolas, monospace',
  fontSize: 14,
  lineHeight: 1.2,
  cursorBlink: true,
  cursorStyle: 'bar',
  allowTransparency: true,   // necessario pro fundo translucido / acrilico
  allowProposedApi: true,
  scrollback: 10000,
  // CORRECAO do backspace/previsao: xterm precisa saber que a saida vem do ConPTY,
  // senao o PSReadLine dessincroniza (digitar "aaa" vira "adaa" e nao apaga).
  windowsPty: { backend: 'conpty', buildNumber: winBuild },
  theme: campbell,
});

const fit = new FitAddon();
term.loadAddon(fit);
term.loadAddon(new WebLinksAddon());
// larguras Unicode 11 (emoji ⚡🚀 = 2 celulas): sem isso o cursor dessincroniza
// e digitar duplica caracteres ("getdate" -> "gegetdate")
term.loadAddon(new Unicode11Addon());
term.unicode.activeVersion = '11';
term.open(document.getElementById('term'));

// renderer WebGL: cores truecolor corretas COM fundo transparente (acrilico)
try {
  const webgl = new WebglAddon();
  webgl.onContextLoss(() => { webgl.dispose(); }); // se perder o contexto, volta pro canvas
  term.loadAddon(webgl);
} catch (e) {
  console.warn('WebGL indisponivel, usando canvas:', e);
}

fit.fit();
term.focus();

// RESIZE COALESCIDO: o ResizeObserver dispara a cada frame do arraste. Mandar um
// ResizePseudoConsole por frame faz o conhost repintar em cima de si mesmo, e o
// prompt direito do oh-my-posh deixa rastro de fundo (o "erase to end of line"
// pinta com a cor de fundo ativa — BCE). O Windows Terminal junta os resizes;
// aqui fazemos igual: o fit e imediato (a tela acompanha o arraste) e o aviso ao
// pty so vai quando o tamanho para de mudar — e so se cols/rows mudaram mesmo.
let ultimoTamanho = { cols: 0, rows: 0 };
let timerResize = null;

function avisarPty() {
  if (term.cols === ultimoTamanho.cols && term.rows === ultimoTamanho.rows) return;
  ultimoTamanho = { cols: term.cols, rows: term.rows };
  ipcRenderer.send('pty:resize', { cols: term.cols, rows: term.rows });
}

function ajustar() {
  fit.fit();
  clearTimeout(timerResize);
  timerResize = setTimeout(avisarPty, 120);
}
window.addEventListener('resize', ajustar);
new ResizeObserver(ajustar).observe(document.getElementById('term'));
setTimeout(ajustar, 50);
// re-mede quando a fonte embutida terminar de carregar (senao a largura sai errada)
if (document.fonts && document.fonts.ready) { document.fonts.ready.then(ajustar); }

term.onData((d) => ipcRenderer.send('pty:input', d));

// Ctrl+Enter / Shift+Enter = quebra de linha (PSReadLine e Claude Code). O xterm manda
// so "\r" pra qualquer Enter, entao o shell nao distingue. Mandamos a tecla com os
// modificadores de verdade no formato win32-input-mode do ConPTY (o mesmo que o
// Windows Terminal usa): ESC [ Vk ; Sc ; Uc ; KeyDown ; CtrlState ; Repeat _
//   Vk=13 (VK_RETURN), Sc=28, Uc=10 com Ctrl (como o Windows faz) / 13 com Shift,
//   CtrlState: 0x08 = LEFT_CTRL_PRESSED, 0x10 = SHIFT_PRESSED
// Assim o PSReadLine ve Ctrl+Enter/Shift+Enter e o Node (Claude Code) recebe "\n" (Ctrl+J).
function teclaEnterWin32(ctrl, shift) {
  const cs = (ctrl ? 0x08 : 0) | (shift ? 0x10 : 0);
  const ch = ctrl ? 10 : 13;
  return `\x1b[13;28;${ch};1;${cs};1_` + `\x1b[13;28;${ch};0;${cs};1_`;
}
term.attachCustomKeyEventHandler((ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.shiftKey) && !ev.altKey && !ev.metaKey) {
    if (ev.type === 'keydown') ipcRenderer.send('pty:input', teclaEnterWin32(ev.ctrlKey, ev.shiftKey));
    return false;
  }
  return true;
});
ipcRenderer.on('pty:data', (_e, d) => term.write(d));
// ouvinte pronto: avisa o main pra despejar o que o PS ja tiver cuspido
ipcRenderer.send('pty:ready');

// versao na barra de titulo
ipcRenderer.invoke('app:versao').then((v) => { document.getElementById('versao').textContent = 'v' + v; }).catch(() => {});

// estado oculto/visivel
const ponto = document.getElementById('ponto');
const estado = document.getElementById('estado');
function pintarEstado(oculto) {
  ponto.classList.toggle('visivel', !oculto);
  estado.textContent = oculto ? 'oculto na captura' : 'VISIVEL na captura';
}
ipcRenderer.on('win:ocultoMudou', (_e, oculto) => { pintarEstado(oculto); term.focus(); });
ipcRenderer.invoke('win:estadoOculto').then(pintarEstado);

// botoes da barra
document.getElementById('min').addEventListener('click', () => ipcRenderer.send('win:min'));
document.getElementById('max').addEventListener('click', () => ipcRenderer.send('win:max'));
document.getElementById('fechar').addEventListener('click', () => ipcRenderer.send('win:close'));

// clicar em qualquer lugar do terminal devolve o foco
document.getElementById('term').addEventListener('mousedown', () => term.focus());

