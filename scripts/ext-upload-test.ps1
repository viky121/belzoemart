$ErrorActionPreference = 'Stop'
$key = ".\Belzo-key.pem"
$e = (ssh -o StrictHostKeyChecking=no -i $key ubuntu@13.48.85.9 "grep -E '^SEED_ADMIN_EMAIL=' ~/belzo/.env.prod | cut -d= -f2-").Trim()
$p = (ssh -o StrictHostKeyChecking=no -i $key ubuntu@13.48.85.9 "grep -E '^SEED_ADMIN_PASSWORD=' ~/belzo/.env.prod | cut -d= -f2-").Trim()
$body = @{ email = $e; password = $p } | ConvertTo-Json -Compress
Set-Content -Path login-body.json -Value $body -NoNewline -Encoding ascii
curl.exe -s -o login.json "http://13.48.85.9/api/v1/admin/auth/login" -X POST -H "Content-Type: application/json" --data-binary "@login-body.json" | Out-Null
$tok = ((Get-Content login.json -Raw) | ConvertFrom-Json).accessToken

# Build a valid ~6.5MB PNG: real PNG header + huge ancillary chunk padding.
$small = [System.IO.File]::ReadAllBytes("C:\Users\dell\Downloads\categories\categories\01_Groceries.png")
$big = New-Object byte[] (6.5MB)
[Array]::Copy($small, 0, $big, 0, $small.Length)
# fill remainder with 0x00 (still saved as .png / image/png by curl via extension)
[System.IO.File]::WriteAllBytes("big.png", $big)
Write-Output ("BIG_BYTES=" + (Get-Item big.png).Length)

$code = curl.exe -s -o big-out.json -w "%{http_code}" --max-time 60 -X POST "http://13.48.85.9/api/v1/admin/media/upload" -H "Authorization: Bearer $tok" -F "folder=products" -F "file=@big.png;type=image/png"
Write-Output "BIG_UPLOAD_HTTP=$code"
Write-Output ("BIG_RESP=" + (Get-Content big-out.json -Raw))
