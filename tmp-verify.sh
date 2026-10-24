#!/usr/bin/env bash
P="?w=800&q=80&auto=format&fit=crop"
declare -A C=(
  [tshirt1]=1521572163474-6864f9cf17ab
  [tshirt2]=1576566588028-4147f3842f27
  [jeans1]=1542272604-787c3835535d
  [jeans2]=1541099649105-f69ad21f3246
  [charger1]=1583863788434-e58a36330cf0
  [charger2]=1588872657578-7efd1f1555ed
  [earbuds1]=1590658268037-6bf12165a8df
  [earbuds2]=1606220588913-b3aacb4d2f46
  [vase1]=1578500494198-246f612d3b3d
  [vase2]=1612196808214-b7e239e5f6dc
  [jute1]=1591561954557-26941169b49e
  [jute2]=1584917865442-de89df76afd3
  [oil1]=1474979266404-7eaacbcd87c5
  [oil2]=1509358271058-acd22cc93898
  [rice1]=1586201375761-83865001e31c
  [rice2]=1516684732162-798a0062be99
  [banner1]=1607082348824-0a96f2a4b9da
  [banner2]=1483985988355-763728e1935b
  [banner3]=1607083206968-13611e3d76db
)
for k in "${!C[@]}"; do
  u="https://images.unsplash.com/photo-${C[$k]}${P}"
  read code ct < <(curl -s -L -o /dev/null -w '%{http_code} %{content_type}' --max-time 15 "$u")
  echo "$k  $code  $ct"
done | sort
