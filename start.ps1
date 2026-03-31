# Cognexia Launcher — Windows (PowerShell)
# Usage:
#   .\start.ps1 start
#   .\start.ps1 stop
#   .\start.ps1 status
#
# Run once to allow script execution (if blocked):
#   Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

param([string]$Command = "help")

$DataLake  = "$env:USERPROFILE\.cognexia\data-lake"
$PidFile   = "$env:TEMP\cognexia.pid"
$LogFile   = "$env:TEMP\cognexia.log"
$Port      = if ($env:PORT) { $env:PORT } else { "10000" }
$ServerUrl = "http://localhost:$Port"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-RunningPid {
    if (Test-Path $PidFile) {
        $pid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($pid -and (Get-Process -Id $pid -ErrorAction SilentlyContinue)) {
            return [int]$pid
        }
    }
    return $null
}

function Test-ServerHealth {
    try {
        $response = Invoke-WebRequest -Uri "$ServerUrl/api/health" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

switch ($Command) {

    "start" {
        $running = Get-RunningPid
        if ($running) {
            Write-Host "Cognexia already running (PID: $running)"
            exit 0
        }

        Write-Host "Starting Cognexia Data Lake..."
        Write-Host "  Data Lake: $DataLake"

        # Create data directory
        New-Item -ItemType Directory -Force -Path $DataLake | Out-Null

        # Start server as a background job, redirect output to log
        $process = Start-Process -FilePath "node" `
            -ArgumentList "server.js" `
            -WorkingDirectory $ScriptDir `
            -RedirectStandardOutput $LogFile `
            -RedirectStandardError $LogFile `
            -WindowStyle Hidden `
            -PassThru

        $process.Id | Set-Content $PidFile

        # Wait up to 10s for the server to respond
        $attempts = 0
        do {
            Start-Sleep -Seconds 1
            $attempts++
        } while (-not (Test-ServerHealth) -and $attempts -lt 10)

        if (Test-ServerHealth) {
            Write-Host "✅ Cognexia running on $ServerUrl"
            Write-Host "   Log: $LogFile"
        } else {
            Write-Host "❌ Failed to start. Check log: $LogFile"
            exit 1
        }
    }

    "stop" {
        $running = Get-RunningPid
        if ($running) {
            Stop-Process -Id $running -Force -ErrorAction SilentlyContinue
            Remove-Item $PidFile -ErrorAction SilentlyContinue
            Write-Host "Cognexia stopped"
        } else {
            Write-Host "Cognexia not running"
        }
    }

    "status" {
        $running = Get-RunningPid
        if ($running) {
            Write-Host "✅ Cognexia running (PID: $running)"
            if (Test-ServerHealth) {
                Write-Host "   $ServerUrl — OK"
            } else {
                Write-Host "   Process alive but server not responding"
            }
        } else {
            Write-Host "❌ Cognexia not running"
        }
    }

    default {
        Write-Host "Cognexia Launcher"
        Write-Host ""
        Write-Host "Usage:  .\start.ps1 <command>"
        Write-Host ""
        Write-Host "Commands:"
        Write-Host "  start    Start the server (background)"
        Write-Host "  stop     Stop the server"
        Write-Host "  status   Check if running"
        Write-Host ""
        Write-Host "Options (environment variables):"
        Write-Host "  `$env:PORT            = 10000  (default)"
        Write-Host "  `$env:DATA_LAKE_PATH  = custom data directory"
        Write-Host ""
        Write-Host "Example:"
        Write-Host "  `$env:PORT = '8080'; .\start.ps1 start"
    }
}
