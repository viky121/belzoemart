$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$base = "http://localhost:4000/api/v1"

function Show($label, $obj) {
  Write-Host "==== $label ====" -ForegroundColor Cyan
  $obj | ConvertTo-Json -Depth 8
}

# 1. LOGIN
$loginBody = @{ email = "customer@belzo.local"; password = "Customer#12345" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $login.accessToken; if (-not $token) { $token = $login.data.accessToken }
Write-Host "1. LOGIN ok  token-len=$($token.Length)" -ForegroundColor Green
$auth = @{ Authorization = "Bearer $token" }

# 2. PICK A PRODUCT (list -> detail for variants)
$products = Invoke-RestMethod -Uri "$base/products?limit=5" -Method Get
$summary = $products.items | Select-Object -First 1
$prod = Invoke-RestMethod -Uri "$base/products/$($summary.slug)" -Method Get
$variantId = $prod.variants[0].id
Write-Host "2. PRODUCT '$($prod.title)' variant=$($prod.variants[0].sku) price=$($prod.variants[0].sellingPrice)" -ForegroundColor Green

# 3. ADD TO CART
$cartBody = @{ variantId = $variantId; quantity = 1 } | ConvertTo-Json
$cart = Invoke-RestMethod -Uri "$base/cart/items" -Method Post -Body $cartBody -ContentType "application/json" -Headers $auth
Write-Host "3. CART items=$($cart.items.Count)" -ForegroundColor Green

# 4. ADDRESS
$addrBody = @{
  label = "home"; fullName = "Test Customer"; phone = "9876543210";
  line1 = "12 MG Road"; line2 = "Indiranagar"; city = "Bengaluru"; state = "Karnataka"; pincode = "560038"
} | ConvertTo-Json
$addr = Invoke-RestMethod -Uri "$base/me/addresses?default=true" -Method Post -Body $addrBody -ContentType "application/json" -Headers $auth
$addressId = $addr.id; if (-not $addressId) { $addressId = $addr.data.id }
Write-Host "4. ADDRESS id=$addressId $($addr.city)/$($addr.state)" -ForegroundColor Green

# 5. PREVIEW
$prevBody = @{ addressId = $addressId; couponCode = "WELCOME10" } | ConvertTo-Json
$prev = Invoke-RestMethod -Uri "$base/checkout/preview" -Method Post -Body $prevBody -ContentType "application/json" -Headers $auth
Show "5. CHECKOUT PREVIEW" $prev

# 6. PLACE ORDER (idempotency key)
$idemKey = [guid]::NewGuid().ToString()
$orderBody = @{ addressId = $addressId; paymentMethod = "upi"; couponCode = "WELCOME10" } | ConvertTo-Json
$order = Invoke-RestMethod -Uri "$base/checkout/place?idempotencyKey=$idemKey" -Method Post -Body $orderBody -ContentType "application/json" -Headers $auth
$oid = $order.orderId; if (-not $oid) { $oid = $order.id }
Show "6. ORDER PLACED" $order
Write-Host "   ORDER ID = $oid" -ForegroundColor Green

# 7. WEBHOOK (mock payment captured)
$evtBody = "{`"eventId`":`"evt_$oid`",`"event`":`"payment.captured`",`"providerOrderId`":`"mock_order_$oid`",`"method`":`"upi`"}"
$sha = [System.Security.Cryptography.SHA256]::Create()
$sig = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($evtBody))) -replace "-","").ToLower()
$whHeaders = @{ "x-webhook-signature" = $sig }
$wh = Invoke-RestMethod -Uri "$base/payments/webhook" -Method Post -Body $evtBody -ContentType "application/json" -Headers $whHeaders
Show "7. PAYMENT WEBHOOK" $wh

Write-Host "   waiting 6s for fulfilment worker..." -ForegroundColor DarkGray
Start-Sleep -Seconds 6

# 8. RE-FETCH ORDER (should be confirmed + shipment)
$final = Invoke-RestMethod -Uri "$base/orders/$oid" -Method Get -Headers $auth
Show "8. ORDER FINAL" $final

# 9. INVOICE
try {
  $inv = Invoke-RestMethod -Uri "$base/orders/$oid/invoice" -Method Get -Headers $auth
  Show "9. INVOICE" $inv
} catch {
  Write-Host "9. INVOICE fetch error: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 10. TRACKING
try {
  $trk = Invoke-RestMethod -Uri "$base/orders/$oid/tracking" -Method Get -Headers $auth
  Show "10. TRACKING" $trk
} catch {
  Write-Host "10. TRACKING error: $($_.Exception.Message)" -ForegroundColor Yellow
}
