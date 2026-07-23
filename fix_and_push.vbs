Set objShell = CreateObject("WScript.Shell")
Dim log
log = "D:\leedtopsmm\git_push_log.txt"

' index.lock ni o'chirish
objShell.Run "cmd /c del /f /q ""D:\leedtopsmm\.git\index.lock"" 2>nul", 0, True

' Git operatsiyalar
objShell.Run "cmd /c cd /d D:\leedtopsmm && git add -A >> """ & log & """ 2>&1", 0, True
objShell.Run "cmd /c cd /d D:\leedtopsmm && git commit -m ""feat: outreach moduli — kampaniyalar, akkountlar, AI javob, inbox monitor"" >> """ & log & """ 2>&1", 0, True
objShell.Run "cmd /c cd /d D:\leedtopsmm && git push >> """ & log & """ 2>&1", 1, True

MsgBox "Tayyor! Log: " & log, 0, "Done"
