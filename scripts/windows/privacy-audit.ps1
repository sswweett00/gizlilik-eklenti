$ErrorActionPreference = "SilentlyContinue"
Write-Host "=== Privacy Shield Windows Audit ==="
Write-Host "`n[Wi-Fi]"
netsh wlan show interfaces
Write-Host "`n[MAC]"
getmac /v
Write-Host "`n[IP configuration]"
Get-NetIPConfiguration | Format-List
Write-Host "`n[Location policy]"
Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location"
Write-Host "`n[Browser/Tor processes]"
Get-Process chrome,msedge,firefox,tor -ErrorAction SilentlyContinue | Select-Object ProcessName,Id,Path
Write-Host "`nAudit only: no setting is modified."