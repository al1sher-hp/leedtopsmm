Set objShell = CreateObject("WScript.Shell")
Dim log
log = "D:\leedtopsmm\git_push_log.txt"

objShell.Run "cmd /c cd /d D:\leedtopsmm && git add -A >> """ & log & """ 2>&1", 0, True
objShell.Run "cmd /c cd /d D:\leedtopsmm && git commit -m ""feat: kanal izohlari + guruh a'zolari XLSX eksporti + scan XLSX"" >> """ & log & """ 2>&1", 0, True
objShell.Run "cmd /c cd /d D:\leedtopsmm && git push >> """ & log & """ 2>&1", 1, True

MsgBox "Push tugadi! Log: " & log, 0, "Done"
