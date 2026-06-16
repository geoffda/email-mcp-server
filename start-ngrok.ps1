Write-Host "Starting ngrok..."
& "C:\Users\geoff\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 3000 --url=https://landlady-oversold-scenic.ngrok-free.dev
Write-Host "ngrok exited with code $LASTEXITCODE"
Read-Host "Press Enter to close"
