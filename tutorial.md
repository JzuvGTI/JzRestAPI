# Tutorial Setup VPS (Ubuntu) untuk JzREST API

Panduan ini untuk deploy dari **VPS fresh** sampai live di domain `api.jzuv.my.id`.

## 1) Login ke VPS

```bash
ssh root@IP_VPS
```

## 2) Install paket dasar

```bash
apt update && apt upgrade -y
apt install -y curl git unzip build-essential nginx mysql-server ufw
timedatectl set-timezone Asia/Jakarta
```

## 3) Buat user deploy

```bash
adduser deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Login ulang:

```bash
ssh deploy@IP_VPS
```

## 4) Install Node.js + PM2 (user deploy)

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
nvm alias default 22
node -v
npm -v
npm i -g pm2
```

## 5) Setup firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## 6) Setup MySQL

Masuk MySQL:

```bash
sudo mysql
```

Lalu jalankan:

```sql
CREATE DATABASE jzrestapi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'jzapi'@'localhost' IDENTIFIED BY 'PASSWORD_DB_KUAT';
GRANT ALL PRIVILEGES ON jzrestapi.* TO 'jzapi'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Tes login:

```bash
mysql -u jzapi -p -h 127.0.0.1 jzrestapi
```

## 7) Upload/clone project

```bash
sudo mkdir -p /var/www/jzrestapi
sudo chown -R deploy:deploy /var/www/jzrestapi
cd /var/www
git clone https://github.com/USERNAME/REPO.git jzrestapi
cd /var/www/jzrestapi
```

## 8) Buat file `.env` production

Generate secret:

```bash
openssl rand -base64 48
```

Contoh `.env`:

```env
DATABASE_URL="mysql://jzapi:PASSWORD_ENCODED@127.0.0.1:3306/jzrestapi"

AUTH_TRUST_HOST=true
AUTH_URL="https://api.jzuv.my.id"
AUTH_SECRET="SECRET_RANDOM_PANJANG"

NEXTAUTH_URL="https://api.jzuv.my.id"
NEXTAUTH_SECRET="SECRET_RANDOM_PANJANG"
NEXT_PUBLIC_APP_URL="https://api.jzuv.my.id"

GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

NEXT_PUBLIC_TURNSTILE_SITE_KEY="..."
TURNSTILE_SECRET_KEY="..."

KRL_API_BASE_URL="https://api-partner.krl.co.id"
KRL_API_TOKEN="Bearer ..."
IMEI_API_KEY="..."

INTERNAL_APP_ORIGIN="http://127.0.0.1:3000"
```

Catatan:
- `AUTH_SECRET` dan `NEXTAUTH_SECRET` sebaiknya sama.
- Jika password DB ada karakter `@`, ubah jadi `%40`.

## 9) Install dependency + build

```bash
cd /var/www/jzrestapi
npm ci
npx prisma generate
npx prisma db push
rm -rf .next
npm run build
```

## 10) Jalankan app dengan PM2

```bash
cd /var/www/jzrestapi
pm2 start npm --name jzrestapi -- run start
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy
```

Jalankan command `sudo ...` yang keluar dari `pm2 startup`.

Cek status:

```bash
pm2 list
pm2 logs jzrestapi --lines 100
```

## 11) Setup Nginx reverse proxy

Buat file:

```bash
sudo nano /etc/nginx/sites-available/jzrestapi
```

Isi:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.jzuv.my.id IP_VPS;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Aktifkan:

```bash
sudo ln -sfn /etc/nginx/sites-available/jzrestapi /etc/nginx/sites-enabled/jzrestapi
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 12) Setup DNS Cloudflare

- Buat record `A`:
  - Name: `api`
  - Value: `IP_VPS`
  - Proxy: **DNS only** dulu (abu-abu)

## 13) Pasang SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.jzuv.my.id --redirect
```

Setelah SSL beres:
- Ubah Cloudflare ke **Proxied** (oranye)
- SSL mode Cloudflare: **Full (strict)**

## 14) Verifikasi

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
curl -I https://api.jzuv.my.id
curl -s https://api.jzuv.my.id/api/auth/session
```

## 15) Set role SUPERADMIN

```bash
sudo mysql
```

```sql
USE jzrestapi;
UPDATE `User` SET `role`='SUPERADMIN' WHERE `email`='emailkamu@domain.com';
SELECT id,email,role FROM `User` WHERE `email`='emailkamu@domain.com';
EXIT;
```

Logout/login ulang di web.

## 16) Deploy update berikutnya

```bash
cd /var/www/jzrestapi
git pull
npm ci
npx prisma db push
rm -rf .next
npm run build
pm2 restart jzrestapi --update-env
```

## 17) Troubleshooting cepat

- Jika login Google error `UntrustedHost`:
  - pastikan `.env` ada `AUTH_TRUST_HOST=true`, `AUTH_URL`, `NEXTAUTH_URL`.
  - build ulang + `pm2 restart ... --update-env`.

- Jika dashboard loop ke `/login?callbackUrl=...`:
  - pastikan hanya 1 process PM2:
    ```bash
    pm2 list
    ```
  - hapus duplikat process lalu restart.

- Jika site timeout:
  - cek `pm2 logs`, `sudo systemctl status nginx`, `sudo ufw status`.
  - pastikan firewall provider membuka port 80/443/22.

