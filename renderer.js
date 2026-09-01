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

function ajustar() {
  fit.fit();
  ipcRenderer.send('pty:resize', { cols: term.cols, rows: term.rows });
}
window.addEventListener('resize', ajustar);
new ResizeObserver(ajustar).observe(document.getElementById('term'));
setTimeout(ajustar, 50);
// re-mede quando a fonte embutida terminar de carregar (senao a largura sai errada)
if (document.fonts && document.fonts.ready) { document.fonts.ready.then(ajustar); }

term.onData((d) => ipcRenderer.send('pty:input', d));

// Ctrl+Enter / Shift+Enter = quebra de linha no Claude Code. O xterm manda so "\r"
// pra qualquer Enter (o app nao distingue e ENVIA a mensagem). Mandamos ESC+CR, o
// mesmo que o Alt+Enter e que o /terminal-setup configura no Windows Terminal.
term.attachCustomKeyEventHandler((ev) => {
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.shiftKey) && !ev.altKey && !ev.metaKey) {
    if (ev.type === 'keydown') ipcRenderer.send('pty:input', '\x1b\r');
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
document.getElementById('fechar').addEventListener('click', () => ipcRenderer.send('win:close'));

// clicar em qualquer lugar do terminal devolve o foco
document.getElementById('term').addEventListener('mousedown', () => term.focus());
