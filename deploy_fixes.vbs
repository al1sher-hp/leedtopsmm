Set objShell = CreateObject("WScript.Shell")
Dim log
log = "D:\leedtopsmm\deploy_fixes_log.txt"

' Docker orqali rebuild va restart
objShell.Run "cmd /c cd /d D:\leedtopsmm && docker compose up --build -d > """ & log & """ 2>&1", 1, True

MsgBox "Deploy tugadi! Log: " & log, 0, "Done"
