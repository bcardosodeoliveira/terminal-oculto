# Terminal (oculto à captura de tela)

Um terminal que **você vê no monitor, mas some de qualquer captura de tela** —
Google Meet, Teams, Zoom, OBS, PrintScreen. Serve para mexer no Claude Code (ou
em qualquer coisa no terminal) enquanto compartilha a **tela inteira** numa
apresentação, sem a plateia ver o terminal.

O nome/título é só **"Terminal"** de propósito, pra não dar na cara.

---

## Como usar

1. Abra o atalho **`Terminal`** na Área de Trabalho (ou rode `Terminal.vbs` na pasta).
2. Abre um **PowerShell 7** dentro da janela. Digite `claude` (ou o que quiser).
3. **`Ctrl+Shift+H`** liga/desliga a invisibilidade a qualquer momento
   (atalho global — funciona mesmo sem a janela em foco).
   - Bolinha **verde** + "oculto na captura" = a plateia NÃO vê.
   - Bolinha **vermelha** + "VISIVEL na captura" = aparece na captura de novo.
4. Compartilhe **a tela inteira** no Meet. A janela não aparece pra quem assiste.

> **Teste antes da reunião:** abra um Meet sozinho, compartilhe a tela e confira o
> preview. Deve estar tudo lá, menos esta janela.

---

## Como funciona (resumo técnico)

- Usa a API do Windows `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE=0x11)`.
  A janela continua no monitor, mas o compositor (DWM) a remove de qualquer captura.
  É o mesmo mecanismo que Netflix e apps de banco usam pra bloquear print.
- **Regra de ouro:** só o **processo dono** da janela pode se esconder. Por isso não
  dá pra "ocultar o Windows Terminal por fora" com um script PowerShell — retorna
  `Acesso negado`. Reparentar a janela também não resolve (a afinidade não passa de
  pai pra filho entre processos — testado). A saída foi um terminal **próprio**
  (Electron) que chama a API na própria janela via `win.setContentProtection(true)`.
- Dentro: **Electron** (janela) + **xterm.js** (render do terminal) +
  **@lydell/node-pty** (o PTY/ConPTY que roda o shell). O `@lydell/node-pty` é N-API
  (binário pronto, estável entre versões — sem recompilar).

---

## O que a plateia PODE ver (limites)

- **A janela** some da captura. ✔
- O **botão na barra de tarefas** continua lá (nome "Terminal" — discreto). Se quiser
  sumir totalmente com ele, dá pra ativar `skipTaskbar` no `main.js`.
- **Notificações/sons** do que roda dentro não são afetados.
- Só funciona no **Windows 10 2004+ (build 19041)**. Aqui a build é 26200, ok.

---

## Personalizar

- **Fonte e cores:** `renderer.js` — objeto `campbell` (esquema de cores) e
  `fontFamily` (hoje `CaskaydiaCove Nerd Font Mono`, tamanho 14).
- **Shell padrão:** `main.js`, função `acharShell()` (hoje PowerShell 7). Pra abrir já
  no Claude Code, troque o spawn para o `claude.exe`
  (`C:\Users\bruno\.local\bin\claude.exe`).
- **Atalho de esconder/mostrar:** `main.js`, `globalShortcut.register('CommandOrControl+Shift+H', ...)`.

---

## Estrutura

    D:\Apps\ClaudeOculto\
    ├─ main.js        # processo Electron: janela + setContentProtection + PTY
    ├─ renderer.js    # xterm.js: render, cores Campbell, fonte, resize
    ├─ index.html     # UI (barra de título própria, indicador de estado)
    ├─ Terminal.vbs   # lançador sem flash de console
    ├─ package.json
    └─ node_modules\  # (fora do OneDrive de propósito — não sincroniza)

Pasta fora do OneDrive pra não sincronizar o Electron (~190MB).

## Rodar em modo dev / reinstalar

    cd D:\Apps\ClaudeOculto
    npm install
    node node_modules\electron\install.js   # baixa o binário do Electron, se faltar
    npm start                               # abre a janela

## Solução de problemas

- **Janela fica preta na captura em vez de sumir:** build do Windows < 19041.
- **Aparece na captura mesmo assim:** confirme a bolinha verde (`Ctrl+Shift+H`).
- **Backspace nao apaga / digitar "aaa" vira "adaa":** faltou `conptyInheritCursor: true` no `pty.spawn` (main.js). E o que sincroniza o cursor do PSReadLine. NAO remover.
- **oh-my-posh sem cor (segmentos brancos) ou logo cinza:** precisa do renderer WebGL (GPU ligada, addon-webgl) + `COLORTERM=truecolor`. Nao usar `disableHardwareAcceleration`.
- **Erro ao carregar o PTY:** apague `node_modules` e rode `npm install` de novo.
- **`claude` avisa "Transcript saving is off / CLAUDE_CODE_CHILD_SESSION":** so acontece se o app for aberto de dentro de outra sessao do Claude Code. O `main.js` ja limpa as variaveis `CLAUDE_CODE_*`, `CLAUDECODE` e `CLAUDE_PID` antes de abrir o shell, entao o terminal se comporta como um normal.
