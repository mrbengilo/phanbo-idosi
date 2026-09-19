# Triển khai `khoidosi.io.vn`

Tài liệu này là runbook production cho một VPS Linux chạy Docker Engine và Docker Compose v2.
Không lưu mật khẩu, token registry, khóa SSH hoặc file môi trường production vào Git.

## Điều kiện bắt buộc

- Nhánh phát hành đã được review, CI xanh và checkout đúng một commit SHA đầy đủ.
- Bản ghi `A` của `khoidosi.io.vn` trỏ tới IP công khai của VPS.
- TCP 22 chỉ mở cho địa chỉ quản trị; TCP 80, TCP 443 và UDP 443 mở công khai.
- VPS có Docker Engine, Compose v2, đồng bộ thời gian và ít nhất một thư mục backup nằm ngoài checkout.
- Có tài khoản SSH dùng khóa, có quyền chạy Docker và quyền quản trị firewall cần thiết.
- Có kế hoạch backup ngoài VPS và đã thử restore vào database mới.

## Biến môi trường

Tạo file chỉ đọc bởi root, ví dụ `/etc/phanbo-idosi/production.env`, từ `.env.example`.
Các giá trị tối thiểu phải được thay bằng giá trị production:

```dotenv
APP_DOMAIN=khoidosi.io.vn
WEB_ORIGIN=https://khoidosi.io.vn
IMAGE_PREFIX=local/phanbo-idosi
IMAGE_TAG=<FULL_COMMIT_SHA>
POSTGRES_PASSWORD=<RANDOM_LONG_SECRET>
DATABASE_URL=postgresql://idosi:<URL_ENCODED_PASSWORD>@db:5432/idosi
```

Giữ `VITE_ENABLE_MOCK_FALLBACK=false`. `DATABASE_URL` phải dùng hostname nội bộ `db`; PostgreSQL
không được publish ra Internet. Khóa file bằng `chmod 600` và không đặt các biến
`BOOTSTRAP_ADMIN_*` lâu dài trong file này.

## Preflight trên VPS

Chạy từ checkout sạch tại commit sẽ phát hành:

```bash
set -euo pipefail
test -z "$(git status --porcelain)"
release_sha="$(git rev-parse HEAD)"
test "${#release_sha}" -eq 40
docker version
docker compose version
docker compose --env-file /etc/phanbo-idosi/production.env config --quiet
```

Đảm bảo `IMAGE_TAG` trong file môi trường đúng bằng `release_sha`. Trước lần triển khai thay thế,
tạo backup đã kiểm tra checksum:

```bash
sudo install -d -m 700 /var/backups/phanbo-idosi
sudo ./infra/scripts/backup-db.sh --output-dir /var/backups/phanbo-idosi
```

Lần triển khai đầu tiên chưa có database đang chạy thì bỏ qua bước backup.

## Build và triển khai

VPS build ảnh bất biến từ đúng checkout; `--pull never` ngăn Compose tìm registry khi dùng prefix
`local/`. Nếu dùng registry, CI phải build/push cùng một SHA cho đủ bốn ảnh `api`, `migrate`,
`worker`, `web` và VPS phải đăng nhập registry trước khi pull.

```bash
set -euo pipefail
env_file=/etc/phanbo-idosi/production.env

docker compose --env-file "$env_file" build --pull api migrate worker web
docker compose --env-file "$env_file" up --detach --pull never --wait db
docker compose --env-file "$env_file" run --rm --no-deps --pull never migrate
docker compose --env-file "$env_file" up --detach --pull never --wait api worker web caddy
docker compose --env-file "$env_file" ps
```

Migration dùng advisory lock và phải hoàn tất trước khi API/worker khởi động. Seed chỉ thêm reference
row còn thiếu; deploy không được đổi tên, kích hoạt lại hoặc phục hồi catalog/store đã được quản trị.

## Tạo Admin lần đầu

Chỉ chạy một lần qua terminal riêng tư. Không đưa mật khẩu vào lịch sử shell hoặc chat. Nạp ba biến
`BOOTSTRAP_ADMIN_*` từ secret manager rồi chạy:

```bash
docker compose \
  --env-file /etc/phanbo-idosi/production.env \
  --profile bootstrap run --rm --no-deps --pull never bootstrap-admin
```

Xóa các biến bootstrap khỏi phiên shell ngay sau khi hoàn tất và đăng nhập kiểm tra bằng HTTPS.

## Kiểm tra sau triển khai

```bash
curl --fail --silent --show-error https://khoidosi.io.vn/health
curl --fail --silent --show-error https://khoidosi.io.vn/ready
curl --fail --silent --show-error https://khoidosi.io.vn/openapi.json >/dev/null
curl --head --fail --silent --show-error https://khoidosi.io.vn/
```

Sau đó kiểm tra bằng trình duyệt trên desktop và mobile:

1. Đăng nhập từng vai trò Admin, HTKD và cửa hàng.
2. Kiểm tra menu/route theo quyền; không có dữ liệu mock trong production.
3. Thực hiện một luồng ghi thử có thể đối soát, xác nhận busy/disabled/error/retry và audit log.
4. Xác nhận API, worker, web, database và Caddy đều healthy; log không có lỗi hoặc secret.
5. Tạo một backup mới và kiểm tra `pg_restore --list`/checksum.

## Rollback

Chỉ rollback ảnh khi schema hiện tại tương thích với commit trước. Script không đảo migration và
không tự restore database:

```bash
./infra/scripts/rollback.sh \
  --from-tag <CURRENT_FULL_SHA> \
  --to-tag <PREVIOUS_VERIFIED_FULL_SHA> \
  --confirm-forward-compatible-db \
  --yes
```

Nếu cần phục hồi dữ liệu, dùng `restore-db.sh` vào một database mới, xác minh độc lập rồi mới đổi
`DATABASE_URL`; không restore đè trực tiếp database đang chạy.

## Gate dừng triển khai

Không triển khai hoặc phải dừng ngay khi có một trong các điều kiện sau:

- CI/test/build chưa xanh hoặc checkout còn thay đổi chưa commit.
- DNS không trỏ đúng VPS, cổng 80/443 chưa truy cập được hoặc Caddy chưa cấp được chứng chỉ.
- Thiếu backup hợp lệ khi thay thế hệ thống đang có dữ liệu.
- Thiếu SSH/registry credential, secret production hoặc quyền firewall.
- Một route production còn hiển thị `UnavailableFeature`, dữ liệu mẫu, nút no-op hoặc mutation không
  có trạng thái bận/lỗi/idempotency phù hợp.
