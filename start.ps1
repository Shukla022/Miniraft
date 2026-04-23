@echo off
REM Startup script for Windows (PowerShell version)
REM Usage: .\start.ps1

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Distributed Drawing Board - Startup (Windows)" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""

# Check if Docker is running
Write-Host "[1/5] Checking Docker installation..." -ForegroundColor Yellow
$dockerPath = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $dockerPath) {
    Write-Host "ERROR: Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "OK: Docker found" -ForegroundColor Green

# Check if Docker Compose is available
Write-Host "[2/5] Checking Docker Compose..." -ForegroundColor Yellow
$composePath = Get-Command docker-compose -ErrorAction SilentlyContinue
if ($null -eq $composePath) {
    Write-Host "ERROR: Docker Compose not found." -ForegroundColor Red
    exit 1
}
Write-Host "OK: Docker Compose ready" -ForegroundColor Green

# Change to project directory
Set-Location $ProjectDir
Write-Host "[3/5] Project directory: $ProjectDir" -ForegroundColor Yellow

# Clean up old containers
Write-Host "[4/5] Cleaning up old containers..." -ForegroundColor Yellow
docker-compose down --remove-orphans 2>$null | Out-Null

# Build and start
Write-Host "[5/5] Building and starting containers..." -ForegroundColor Yellow
docker-compose up -d

# Wait for startup
Write-Host ""
Write-Host "Waiting for services to start (10 seconds)..." -ForegroundColor Cyan
Start-Sleep -Seconds 10

# Show status
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Services Status:" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
docker-compose ps

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "STARTUP COMPLETE!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Open in browser: http://localhost" -ForegroundColor Cyan
Write-Host ""
Write-Host "Replica Status URLs:" -ForegroundColor Yellow
Write-Host "  http://localhost:5001/status" -ForegroundColor Cyan
Write-Host "  http://localhost:5002/status" -ForegroundColor Cyan
Write-Host "  http://localhost:5003/status" -ForegroundColor Cyan
Write-Host ""
Write-Host "View logs: docker-compose logs -f" -ForegroundColor Yellow
Write-Host "Stop: docker-compose stop" -ForegroundColor Yellow
Write-Host "Down: docker-compose down" -ForegroundColor Yellow
Write-Host ""
