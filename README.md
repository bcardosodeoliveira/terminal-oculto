# Terminal oculto à captura de tela

Um terminal que **você vê no seu monitor, mas some de qualquer captura de tela** —
Google Meet, Teams, Zoom, OBS, PrintScreen. Serve pra mexer no terminal (Claude Code,
scripts, o que for) enquanto você compartilha a **tela inteira** numa apresentação,
sem a plateia ver o terminal.

É 100% legítimo: usa a mesma API do Windows (`SetWindowDisplayAffinity` /
`WDA_EXCLUDEFROMCAPTURE`) que Netflix e apps de banco usam pra bloquear print. A janela
continua visível pra você; para a captura, ela simplesmente não existe (nem retângulo
preto).

O nome/título é só **"Terminal"** de propósito, pra não chamar atenção na barra de tarefas.

---

## Baixar e usar (não precisa instalar nada)

1. Vá em **[Releases](../../releases)** e baixe o `Terminal-oculto-x.y.z.exe` (portátil).
2. Dê 2 cliques. Na 1ª vez o Windows mostra **"Windows protegeu seu PC"** (porque o app
   não é assinado) → clique em **Mais informações → Executar assim mesmo**.
3. Abre um **PowerShell 7** (ou o Windows PowerShell 5.1 se você não tiver o 7). Digite
   `claude`, ou qualquer comando.
4. **`Ctrl+Shift+H`** liga/desliga a invisibilidade a qualquer momento (atalho global —
   funciona mesmo sem a janela em foco):
   - Bolinha **verde** + "oculto na captura" = a plateia **não** vê.
   - Bolinha **vermelha** + "VISIVEL na captura" = aparece na captura de novo.
5. Compartilhe **a tela inteira** no Meet. A janela não aparece pra quem assiste.

> **Teste antes da reunião:** abra um Meet sozinho, compartilhe a tela e confira o
> preview. Deve estar tudo lá, menos esta janela.

**Requisitos:** Windows 10 versão 2004+ (build 19041) ou Windows 11. Em versões mais
antigas a flag não existe e a janela ficaria preta na captura em vez de sumir.

---

## Recursos

- Invisível a Meet/Teams/Zoom/OBS/PrintScreen, com `Ctrl+Shift+H` pra alternar.
- **PowerShell 7** por padrão, com fallback automático: PS7 → PS7 da Store → **Windows
  PowerShell 5.1** → `cmd`. Quem não tem o PS7 abre no 5.1 sem erro.
- Suporta seu **oh-my-posh** (prompt colorido, powerline, emoji), **autocomplete/previsão**
  do PSReadLine, Tab-complete e histórico — tudo funcionando.
- Fonte **CaskaydiaCove Nerd Font** embutida (não precisa ter instalada).
- Ambiente limpo: se você abrir de dentro de outra sessão Claude Code, ele remove os
  marcadores de "sessão filha" pra se comportar como um terminal normal.

---

## Como funciona (técnico)

- **Ocultar da captura:** `win.setContentProtection(true)` no Electron, que no Windows
  chama `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE=0x11)`. **Só o processo dono
  da janela pode se esconder** — por isso não dá pra ocultar um terminal externo "por fora";
  o app precisa ser o próprio terminal.
- **Stack:** Electron + [xterm.js](https://xtermjs.org) (render) +
  [`@lydell/node-pty`](https://www.npmjs.com/package/@lydell/node-pty) (PTY/ConPTY, binário
  N-API pronto, sem compilar) rodando o PowerShell.
- **Cores (oh-my-posh, logo do Claude Code):** renderer **WebGL** + `COLORTERM=truecolor`.
  Não usar `disableHardwareAcceleration` (mata as cores).
- **Edição de linha correta (o pulo do gato):** duas coisas juntas —
  - `windowsPty: { backend: 'conpty', buildNumber }` no xterm, e
  - o addon **`@xterm/addon-unicode11`** (larguras Unicode 11).
  Sem o unicode11, o xterm mede os **emojis do prompt (⚡🚀) com largura errada**, o cursor
  do PSReadLine dessincroniza e digitar duplica caracteres ("getdate" → "gegetdate") e o
  backspace parece não apagar. A saída de comando renderiza certo; só a edição da linha
  quebrava.
- **Janela nunca em branco:** a saída do shell é bufferizada até o renderer avisar que está
  pronto, senão o banner/prompt inicial podia se perder numa corrida.

---

## Rodar do código / gerar o .exe

```powershell
git clone https://github.com/bcardosodeoliveira/terminal-oculto.git
cd terminal-oculto
npm install
node node_modules\electron\install.js   # baixa o binário do Electron, se necessário
npm start                               # roda em modo dev
npm run dist                            # gera o portátil em dist\Terminal-oculto-*.exe
npm run dist:setup                      # (opcional) gera um instalador NSIS
```

### Arquivos

| Arquivo | O quê |
|---|---|
| `main.js` | processo Electron: janela, content protection, PTY, atalho global |
| `renderer.js` | xterm.js: render, cores, fonte, `windowsPty`, `unicode11` |
| `index.html` | UI (barra de título própria, indicador de estado, `@font-face`) |
| `fonts/` | CaskaydiaCove Nerd Font embutida |
| `icon.ico` / `icon.png` | ícone do app |

---

## Solução de problemas

- **Janela fica preta na captura em vez de sumir:** Windows anterior ao build 19041.
- **Aparece na captura mesmo assim:** confirme a bolinha verde (`Ctrl+Shift+H`).
- **Digitar duplica / backspace não apaga:** faltou o `@xterm/addon-unicode11` +
  `windowsPty` (ver acima). É a correção principal.
- **oh-my-posh sem cor (segmentos brancos) ou logo cinza:** precisa do renderer WebGL
  (GPU ligada) + `COLORTERM=truecolor`.
- **"Windows protegeu seu PC":** normal, o app não é assinado. Mais informações →
  Executar assim mesmo.
- **`claude` avisa "Transcript saving is off / CLAUDE_CODE_CHILD_SESSION":** só acontece se
  o app for aberto de dentro de outra sessão Claude Code; o próprio app já limpa isso.

---

## Licença

MIT — use, modifique e distribua à vontade.
