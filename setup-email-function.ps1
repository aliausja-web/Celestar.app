# Email Function Setup Script for Windows
# Run this in PowerShell

Write-Host "=== Celestar Email Function Setup ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if Supabase CLI is installed
Write-Host "Step 1: Checking Supabase CLI..." -ForegroundColor Yellow
$supabaseInstalled = Get-Command supabase -ErrorAction SilentlyContinue

if (-not $supabaseInstalled) {
    Write-Host "Supabase CLI not found. Installing via Scoop..." -ForegroundColor Yellow

    # Check if Scoop is installed
    $scoopInstalled = Get-Command scoop -ErrorAction SilentlyContinue

    if (-not $scoopInstalled) {
        Write-Host "Installing Scoop package manager first..." -ForegroundColor Yellow
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
        Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
    }

    Write-Host "Installing Supabase CLI..." -ForegroundColor Yellow
    scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
    scoop install supabase

    Write-Host "✅ Supabase CLI installed!" -ForegroundColor Green
} else {
    Write-Host "✅ Supabase CLI already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "Supabase CLI Version:" -ForegroundColor Cyan
supabase --version

Write-Host ""
Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. Run: supabase login"
Write-Host "2. Get your Project Ref from: https://supabase.com/dashboard/project/_/settings/general"
Write-Host "3. Run: supabase link --project-ref YOUR_PROJECT_REF"
Write-Host "4. Run: supabase secrets set RESEND_API_KEY=your_resend_key_here"
Write-Host "5. Run: cd supabase/functions && supabase functions deploy send-escalation-emails"
Write-Host ""
Write-Host "Press any key to continue with login..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "Logging in to Supabase..." -ForegroundColor Yellow
supabase login
