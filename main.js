const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const os = require('os');
const pty = require('@lydell/node-pty');
const dwm = require('./dwm');

// GPU LIGADA de proposito: o renderer WebGL do xterm precisa dela pra pintar
// as cores (oh-my-posh) e atualizar a tela (backspace). A exclusao da captura
// no Meet funciona com a GPU ligada; o "preto" so acontecia no PrintScreen.
app.setName('Terminal');
app.setAppUserModelId('Terminal');
let win;
let ptyProc;
let oculto = !process.argv.includes('--visivel'); // --visivel = modo de teste (aparece na captura)

// Shell padrao: PowerShell 7 -> PowerShell da Store -> Windows PowerShell -> cmd
// (barras normais de proposito: '\7' viraria caractere octal e quebraria o caminho)
function acharShell() {
  const fs = require('fs');
  const cands = [
    'C:/Program Files/PowerShell/7/pwsh.exe',
    (process.env.LOCALAPPDATA || '') + '/Microsoft/WindowsApps/pwsh.exe',
    'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
  ];
  for (const c of cands) {
    try { fs.accessSync(c); return c; } catch { /* tenta o proximo */ }
  }
  return process.env.COMSPEC || 'cmd.exe';
}

function criarJanela() {
  win = new BrowserWindow({
    width: 1100,
    height: 680,
    minWidth: 480,
    minHeight: 260,
    backgroundColor: '#00000000',        // transparente pro acrilico aparecer
    backgroundMaterial: 'acrylic',       // material acrilico do Windows 11 (blur)
    title: 'Terminal',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // reforca o material (algumas builds ignoram no construtor)
  try { win.setBackgroundMaterial('acrylic'); } catch { /* Win10: ignora */ }

  // Reaplica a moldura estendida do DWM a cada maximizar/restaurar/resize.
  // Sem isto a janela fica PRETA ao maximizar (o Electron zera a moldura e o
  // acrilico some). Tambem arredonda os cantos como o Windows Terminal. Ver dwm.js.
  dwm.vigiar(win);

  // >>> o pulo do gato: esta janela some de qualquer captura de tela <<<
  win.setContentProtection(oculto);

  win.loadFile('index.html');

  // ambiente LIMPO: tira os marcadores de "sessao filha" do Claude Code
  // (senao o claude aqui dentro acha que roda dentro de outro claude e desliga
  //  o salvamento de transcript). Assim o terminal se comporta como um normal.
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || k.startsWith('CLAUDE_CODE_')) delete env[k];
    // NO_COLOR=1 vem do ambiente do Claude Code: herdado, deixa o oh-my-posh
    // sem NENHUMA cor de fundo nos segmentos (prompt cinza). Este terminal
    // pinta cor, entao a variavel nao se aplica aqui.
    if (k === 'NO_COLOR') delete env[k];
    // estado do prompt do shell PAI: se herdado, o oh-my-posh de dentro acha
    // que continua a mesma sessao e reaproveita posicao de cursor/cache.
    if (k === 'POSH_SESSION_ID' || k === 'POSH_CURSOR_LINE' || k === 'POSH_CURSOR_COLUMN') delete env[k];
  }
  // avisa suporte a cor 24-bit pro logo do Claude Code sair colorido (laranja), nao cinza
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';

  const shell = acharShell();
  // autocomplete/previsao do PSReadLine LIGADO normal — a corrupcao era largura
  // de emoji (corrigida pelo unicode11 no renderer), nao a previsao.
  try {
    ptyProc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: process.env.USERPROFILE || os.homedir(),
      env,
      conptyInheritCursor: true,
    });
  } catch (e) {
    // se o pty falhar (ex: antivirus travando o OpenConsole no temp), mostra na janela
    const msg = '\r\n\x1b[31mFalha ao iniciar o shell:\x1b[0m ' + (e && e.message) +
                '\r\nShell: ' + shell + '\r\n';
    win.webContents.once('did-finish-load', () => win.webContents.send('pty:data', msg));
    return;
  }

  // BUFFER anti-corrida: segura a saida do PS ate a janela avisar que esta pronta,
  // senao o banner/prompt inicial pode chegar antes do ouvinte e a janela fica em branco.
  let rendererPronto = false;
  let buffer = [];
  ptyProc.onData((d) => {
    if (!win || win.isDestroyed()) return;
    if (rendererPronto) win.webContents.send('pty:data', d);
    else buffer.push(d);
  });
  ptyProc.onExit(() => { app.quit(); });

  ipcMain.on('pty:ready', () => {
    rendererPronto = true;
    for (const d of buffer) win.webContents.send('pty:data', d);
    buffer = [];
  });
  ipcMain.on('pty:input', (_e, data) => { ptyProc && ptyProc.write(data); });
  ipcMain.on('pty:resize', (_e, { cols, rows }) => {
    try { ptyProc && ptyProc.resize(cols, rows); } catch { /* ignora resize invalido */ }
  });
  ipcMain.on('win:min', () => win.minimize());
  ipcMain.on('win:max', () => {
    if (win.isMaximized()) win.unmaximize(); else win.maximize();
  });
  ipcMain.on('win:close', () => win.close());
  ipcMain.handle('win:toggleOculto', () => {
    oculto = !oculto;
    win.setContentProtection(oculto);
    return oculto;
  });
  ipcMain.handle('win:estadoOculto', () => oculto);
  ipcMain.handle('app:versao', () => app.getVersion());

  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  criarJanela();

  // Ctrl+Shift+H (global) liga/desliga a invisibilidade sem tirar o foco
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (!win) return;
    oculto = !oculto;
    win.setContentProtection(oculto);
    win.webContents.send('win:ocultoMudou', oculto);
  });

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) criarJanela(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
