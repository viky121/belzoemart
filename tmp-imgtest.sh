#!/usr/bin/env bash
for u in \
  "https://loremflickr.com/600/600/tshirt" \
  "https://loremflickr.com/600/600/denim,jeans" \
  "https://picsum.photos/seed/belzo1/600/600" \
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80"; do
  code=$(curl -s -L -o /dev/null -w '%{http_code}' --max-time 15 "$u")
  ct=$(curl -s -L -o /dev/null -w '%{content_type}' --max-time 15 "$u")
  echo "$code  $ct  $u"
done
