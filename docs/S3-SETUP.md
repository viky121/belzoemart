# S3 media storage — setup & switch-on

The app stores uploaded images (product images, banners, category/brand logos) through a
storage port. In production, set `STORAGE_PROVIDER=s3` and the API uploads to an S3 bucket
and serves public URLs (optionally via CloudFront). Uploads go **server-side** (browser →
API → S3), so **no S3 CORS config is needed**.

## 1. Create the bucket
- S3 → Create bucket, e.g. `belzo-media-<something-unique>`, region **ap-south-1** (Mumbai).
- Keep default settings for now.

## 2. Make images publicly readable — pick ONE
### Option A (simplest): public bucket policy
- Bucket → **Permissions** → **Block public access** → turn **off** "Block all public access" (confirm).
- Add a **bucket policy** (replace the bucket name):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadObjects",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::belzo-media-<unique>/*"
  }]
}
```
- Leave `CDN_BASE_URL` empty → URLs look like `https://<bucket>.s3.ap-south-1.amazonaws.com/uploads/...`.

### Option B (recommended): CloudFront + private bucket
- Keep "Block all public access" **on**.
- Create a **CloudFront** distribution with the bucket as origin using **Origin Access Control (OAC)**; CloudFront adds the bucket policy for you.
- Set `CDN_BASE_URL=https://dxxxx.cloudfront.net` → URLs served via CDN.

## 3. Give the API permission to upload — pick ONE
### Option A: EC2 instance role (no keys on the box — preferred)
- IAM → Roles → create role for **EC2**, attach this inline policy (replace bucket), then attach the role to the instance:
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject"],
    "Resource": "arn:aws:s3:::belzo-media-<unique>/*"
  }]
}
```
- Leave `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` empty — the SDK uses the role automatically.

### Option B: IAM user access keys
- IAM → Users → create a user with the same policy above, create an **access key**.
- Put the key/secret in `.env.prod` (below).

## 4. Configure & switch on
Edit `~/belzo/.env.prod` on the server:
```env
STORAGE_PROVIDER=s3
S3_REGION=ap-south-1
S3_BUCKET=belzo-media-<unique>
# Only if using IAM user keys (skip if using an instance role):
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
# Only if using CloudFront:
CDN_BASE_URL=https://dxxxx.cloudfront.net
```
Recreate the API + worker so they pick up the new env (no rebuild needed):
```bash
cd ~/belzo
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d api worker
```

## 5. Use it
- Admin → **Marketing** → Home banner → **Upload image** (file is stored in S3; the URL auto-fills) → Save banner.
- The uploaded image now serves from S3/CloudFront on the storefront hero.
- Upload endpoint: `POST /api/v1/admin/media/upload` (multipart `file`, optional `folder` =
  products|banners|categories|brands), returns `{ url, key }`. Roles: `catalogue_manager` or `marketing`.

## Notes
- Max upload size 5 MB; types: jpeg, png, webp, gif, avif, svg.
- The web app renders any absolute image URL, so S3/CloudFront URLs work with no web rebuild.
- Product **gallery** management UI isn't built yet — the same `adminUpload(file, 'products')`
  helper + endpoint are ready to wire it when that admin screen is added.
