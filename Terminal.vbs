' Abre o terminal invisivel a captura, sem piscar janela de console
Set sh = CreateObject("WScript.Shell")
base = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
sh.CurrentDirectory = base
sh.Run """" & base & "node_modules\electron\dist\electron.exe"" .", 0, False
