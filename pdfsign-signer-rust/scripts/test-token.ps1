# PDFSign - thử token thật (ký offline) và gom báo cáo chẩn đoán.
#
# Chạy:  powershell -ExecutionPolicy Bypass -File test-token.ps1 [-Module <dll>] [-Pdf <file>]
#
# - Hỏi PIN MỘT lần (ô ẩn), chỉ truyền qua stdin cho pdfsign-cli; không ghi PIN ra file hay log.
# - Dừng ngay ở lỗi ký đầu tiên để không nhập sai PIN liên tiếp (token khóa sau 3-5 lần sai).
# - Kết quả + log + file đã ký nằm trong một thư mục trên Desktop và một file .zip để gửi hỗ trợ.

param(
    [string]$Module = "",
    [string]$Pdf = "",
    [string]$Tsa = "http://tsa.ca.gov.vn",
    [string]$Cli = "",
    [string]$OutDir = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Say([string]$text, [string]$color = "Gray") { Write-Host $text -ForegroundColor $color }

# --- Tìm pdfsign-cli và PDF mẫu -------------------------------------------------------------
if (-not $Cli) {
    $candidates = @(
        (Join-Path $PSScriptRoot "..\target\release\pdfsign.exe"),
        (Join-Path $env:LOCALAPPDATA "PDFSign\pdfsign-cli.exe")
    )
    $Cli = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Cli -or -not (Test-Path $Cli)) { Say "Không tìm thấy pdfsign-cli. Cài PDFSign hoặc truyền -Cli <đường dẫn>." "Red"; exit 1 }
if (-not $Pdf) { $Pdf = Join-Path $PSScriptRoot "..\tests\fixtures\sample.pdf" }
if (-not (Test-Path $Pdf)) { Say "Không thấy file PDF mẫu. Truyền -Pdf <file.pdf> (dùng file thử, không dùng hợp đồng thật)." "Red"; exit 1 }
$Cli = (Resolve-Path $Cli).Path
$Pdf = (Resolve-Path $Pdf).Path

if (-not $OutDir) { $OutDir = Join-Path ([Environment]::GetFolderPath("Desktop")) ("PDFSign-test-" + (Get-Date -Format "yyyyMMdd-HHmmss")) }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$report = Join-Path $OutDir "bao-cao.txt"
$log = Join-Path $OutDir "log-chi-tiet.txt"

function Note([string]$text) { Add-Content -Path $report -Value $text -Encoding UTF8 }

# Run pdfsign-cli; returns @{ code; text }. $pin (optional) goes to stdin only.
function RunCli([string[]]$cliArgs, [string]$pin = $null) {
    Add-Content -Path $log -Value ("`n>>> pdfsign " + ($cliArgs -join " ")) -Encoding UTF8
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    if ($null -ne $pin) { $out = $pin | & $Cli @cliArgs 2>&1 } else { $out = & $Cli @cliArgs 2>&1 }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    $text = ($out | ForEach-Object { "$_" }) -join "`n"
    Add-Content -Path $log -Value $text -Encoding UTF8
    return @{ code = $code; text = $text }
}

$modArgs = @(); if ($Module) { $modArgs = @("--module", $Module) }

Note "PDFSign - báo cáo thử token  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Note "Máy: $env:COMPUTERNAME | Windows $([Environment]::OSVersion.Version) | CLI: $Cli"
Note ("CLI version: " + (RunCli @("--version")).text)
Note "TSA: $Tsa"
Note ""

# --- 1. Dò token và chứng thư (chưa cần PIN) -------------------------------------------------
Say "`n== 1. Dò token (chưa cần PIN) ==" "Cyan"
$r = RunCli @("list-tokens")
Say $r.text; Note "== Token ==`n$($r.text)`n"
$r = RunCli (@("list-certs") + $modArgs)
Say $r.text; Note "== Chứng thư ==`n$($r.text)`n"
if ($r.code -ne 0) { Say "Không đọc được chứng thư. Xem $log" "Red"; exit 1 }

$certIndex = Read-Host "Chọn số chứng thư để ký thử (chứng thư còn hạn) [0]"
if (-not $certIndex) { $certIndex = "0" }
Note "Chứng thư chọn: $certIndex`n"

# --- 2. Nhập PIN một lần ----------------------------------------------------------------------
Say "`nCảnh báo: nhập sai PIN nhiều lần sẽ KHÓA token. Nếu phần mềm token báo còn 1 lần, dừng lại." "Yellow"
$secure = Read-Host "PIN token (ẩn)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$pin = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

# --- 3. Các bài ký ------------------------------------------------------------------------------
$boxR = "LAST:0.55,0.05,0.4,0.12"
$boxL = "LAST:0.05,0.05,0.4,0.12"
$batchIn = Join-Path $OutDir "hang-loat-vao"
$batchOut = Join-Path $OutDir "hang-loat-ra"
New-Item -ItemType Directory -Force $batchIn, $batchOut | Out-Null
foreach ($n in "a", "b", "c") { Copy-Item $Pdf (Join-Path $batchIn "$n.pdf") -Force }
$batchFiles = @("a", "b", "c") | ForEach-Object { Join-Path $batchIn "$_.pdf" }
$o = { param($name) Join-Path $OutDir $name }

$tests = @(
    @{ name = "Ký 1 chữ ký B-B"; out = @(& $o "01-BB.pdf"); args = @($Pdf, "--out", (& $o "01-BB.pdf"), "--box", $boxR, "--level", "B-B") },
    @{ name = "Ký 1 chữ ký B-T (dấu thời gian)"; out = @(& $o "02-BT.pdf"); args = @($Pdf, "--out", (& $o "02-BT.pdf"), "--box", $boxR, "--level", "B-T", "--tsa", $Tsa) },
    @{ name = "Ký B-LT (OCSP/CRL)"; out = @(& $o "03-BLT.pdf"); args = @($Pdf, "--out", (& $o "03-BLT.pdf"), "--box", $boxR, "--level", "B-LT", "--tsa", $Tsa) },
    @{ name = "Ký B-LTA (dấu thời gian tài liệu)"; out = @(& $o "04-BLTA.pdf"); args = @($Pdf, "--out", (& $o "04-BLTA.pdf"), "--box", $boxR, "--level", "B-LTA", "--tsa", $Tsa) },
    @{ name = "2 ô chữ ký trên 1 file"; out = @(& $o "05-hai-o.pdf"); args = @($Pdf, "--out", (& $o "05-hai-o.pdf"), "--box", $boxL, "--box", $boxR, "--level", "B-T", "--tsa", $Tsa) },
    @{ name = "Ký lần 2 lên file đã ký"; out = @(& $o "06-ky-lan-2.pdf"); args = @((& $o "02-BT.pdf"), "--out", (& $o "06-ky-lan-2.pdf"), "--box", $boxL, "--level", "B-T", "--tsa", $Tsa) },
    @{ name = "Ký hàng loạt 3 file"; out = @("a", "b", "c" | ForEach-Object { Join-Path $batchOut "$_-da-ky.pdf" }); args = ($batchFiles + @("--out-dir", $batchOut, "--box", $boxR, "--level", "B-T", "--tsa", $Tsa)) }
)

$results = @()
$stopped = $false
foreach ($t in $tests) {
    Say "`n== $($t.name) ==" "Cyan"
    $cliArgs = @("-v", "sign") + $t.args + $modArgs + @("--cert", $certIndex, "--overwrite", "--pin-stdin")
    $r = RunCli $cliArgs $pin
    if ($r.code -ne 0) {
        $msg = ($r.text -split "`n" | Where-Object { $_ -notmatch "^\s*(\x1b\[|20\d\d-)" } | Select-Object -Last 3) -join " "
        Say "KHÔNG ĐẠT: $msg" "Red"
        $results += "[KHÔNG ĐẠT] $($t.name): $msg"
        if ($r.text -match "ERRCODE:PIN_(INCORRECT|LOCKED|INVALID)") {
            Say "Sai PIN hoặc token bị khóa. DỪNG để tránh khóa token." "Red"
        }
        $stopped = $true
        break
    }
    $ok = $true; $levels = @()
    foreach ($f in $t.out) {
        $v = RunCli @("verify", $f)
        Note "== $($t.name) -> $(Split-Path $f -Leaf) ==`n$($v.text)`n"
        if ($v.text -notmatch "tính toàn vẹn OK") { $ok = $false }
        $levels += ([regex]::Matches($v.text, "mức (B-[A-Z]+)") | ForEach-Object { $_.Groups[1].Value })
    }
    $lv = ($levels | Select-Object -Unique) -join ","
    if ($ok) { Say "ĐẠT (mức đạt được: $lv)" "Green"; $results += "[ĐẠT] $($t.name) - mức $lv" }
    else { Say "KÝ ĐƯỢC NHƯNG XÁC MINH LỖI - xem bao-cao.txt" "Red"; $results += "[LỖI XÁC MINH] $($t.name)"; $stopped = $true; break }
}
$pin = $null; $secure.Dispose(); [GC]::Collect()

# --- 4. Tổng kết ------------------------------------------------------------------------------
Note "== TỔNG KẾT =="
$results | ForEach-Object { Note $_ }
if ($stopped) { Note "Đã dừng ở bài lỗi đầu tiên." }
$support = Join-Path $env:APPDATA "PDFSign\logs\pdfsign.log"
if (Test-Path $support) { Copy-Item $support (Join-Path $OutDir "pdfsign-app.log") -Force }

$zip = "$OutDir.zip"
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $zip -Force
Say "`n== TỔNG KẾT ==" "Cyan"
$results | ForEach-Object { if ($_ -like "*ĐẠT]*" -and $_ -notlike "*KHÔNG*") { Say $_ "Green" } else { Say $_ "Red" } }
Say "`nBáo cáo: $report" "Cyan"
Say "Gửi file này cho hỗ trợ (không chứa PIN): $zip" "Cyan"
