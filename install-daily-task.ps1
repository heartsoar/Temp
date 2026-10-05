$ErrorActionPreference = 'Stop'
$radarRoot = $PSScriptRoot
$radarPy = Get-Command py -ErrorAction SilentlyContinue
if ($radarPy) {
    $radarExecutable = $radarPy.Source
    $radarArgs = '-3 "' + (Join-Path $radarRoot 'tools\scheduled_fetch.py') + '"'
} else {
    $radarPy = Get-Command python -ErrorAction Stop
    $radarExecutable = $radarPy.Source
    $radarArgs = '"' + (Join-Path $radarRoot 'tools\scheduled_fetch.py') + '"'
}
$radarAction = New-ScheduledTaskAction -Execute $radarExecutable -Argument $radarArgs -WorkingDirectory $radarRoot
$radarTrigger = New-ScheduledTaskTrigger -Daily -At '08:30'
$radarUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$radarPrincipal = New-ScheduledTaskPrincipal -UserId $radarUser -LogonType Interactive -RunLevel Limited
$radarSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'InvestorResearchDeskDaily' -Action $radarAction -Trigger $radarTrigger -Principal $radarPrincipal -Settings $radarSettings -Description 'Daily public-source collection for Investor Research Desk' -Force
Write-Host 'Created daily task at 08:30 in your computer local timezone. See fetch-log.txt for results.'
