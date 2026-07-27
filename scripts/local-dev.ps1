param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start",
    [int]$Port = 5018,
    [string]$DataHubProxyTarget = "http://127.0.0.1:8090",
    [string]$AnalyticsProxyTarget = ""
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$RunDir = Join-Path $Root ".run-logs"
$PidFile = Join-Path $RunDir "xingshu.pid"

function Stop-ProcessTree([int]$TargetProcessId) {
    $children = Get-CimInstance Win32_Process -Filter "ParentProcessId=$TargetProcessId" -ErrorAction SilentlyContinue
    foreach ($child in $children) {
        Stop-ProcessTree -TargetProcessId $child.ProcessId
    }
    Stop-Process -Id $TargetProcessId -Force -ErrorAction SilentlyContinue
}

function Stop-Xingshu {
    if (Test-Path -LiteralPath $PidFile) {
        $rawPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        $processId = 0
        if ($rawPid -and [int]::TryParse($rawPid, [ref]$processId)) {
            Stop-ProcessTree -TargetProcessId $processId
        }
    }

    $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
        if ($process.CommandLine -like "*$Root*" -and $process.CommandLine -match "vite") {
            Stop-ProcessTree -TargetProcessId $listener.OwningProcess
        } else {
            throw "Port $Port is occupied by another process (PID $($listener.OwningProcess))."
        }
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Start-Xingshu {
    New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
    Stop-Xingshu

    $env:VITE_DATAHUB_PROXY_TARGET = $DataHubProxyTarget
    $env:VITE_ANALYTICS_PROXY_TARGET = $AnalyticsProxyTarget
    $env:VITE_QUERY_ASSETS_ENABLED = "true"
    $vite = Join-Path $Root "node_modules\.bin\vite.cmd"
    if (-not (Test-Path -LiteralPath $vite)) {
        throw "Frontend dependencies are missing. Run npm install first."
    }

    $stdout = Join-Path $RunDir "xingshu.out.log"
    $stderr = Join-Path $RunDir "xingshu.err.log"
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $vite `
        -ArgumentList @("--host", "0.0.0.0", "--port", "$Port", "--strictPort") `
        -WorkingDirectory $Root `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr
    Set-Content -LiteralPath $PidFile -Value $process.Id

    $deadline = (Get-Date).AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -First 1
    } while (-not $listener -and (Get-Date) -lt $deadline)

    if (-not $listener) {
        Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue
        throw "Xingshu frontend failed to listen on port $Port"
    }
    Write-Host "Xingshu frontend started: http://127.0.0.1:$Port"
}

switch ($Action) {
    "start" { Start-Xingshu }
    "restart" { Stop-Xingshu; Start-Xingshu }
    "stop" { Stop-Xingshu }
    "status" {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($listener) {
            Write-Host "Xingshu frontend is running: http://127.0.0.1:$Port"
        } else {
            Write-Host "Xingshu frontend is not running"
        }
    }
}
