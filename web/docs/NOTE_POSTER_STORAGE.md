# Ghi chú: ảnh poster — đã xong, không cần thêm việc

> **Ý tưởng gốc** (từ `supabase-function.md`, giữ nguyên văn):
> "dùng supabase để lưu db poster film, link poster film thay vì load craw film khi vào web
> theo cơ chế serverless. dựa trên bảng db: …"

Ghi chú này **đóng câu hỏi đó**: phần cần làm thì đã làm rồi, phần còn lại đã có quyết định là
**không làm**. Không cần code thêm.

## 1. "Lưu link poster vào DB thay vì crawl khi vào web" — ĐÃ XONG

- Bảng `movies` giữ sẵn **link ảnh**: `poster_url` (ảnh dọc 2:3), `thumb_url` (ảnh ngang 16:9) và
  `poster_source` (nguồn ảnh đang dùng: `phimimg` / `ex-cdn` / …).
- Web đọc list/detail qua **cache read-through** Postgres (`lib/api.server.ts`), nên khi người dùng
  vào trang **không có bước crawl nguồn để lấy ảnh** — đúng ý tưởng.
- Ảnh được phục vụ qua **proxy `/img`** (`src/pages/img.ts`): allowlist host, `sharp` resize +
  chuyển **webp**, `Cache-Control: immutable, max-age=1 năm` → CDN/Supabase lưu đệm, không hotlink
  trực tiếp CDN nguồn.
- Chi tiết bảng & luồng: `docs/PLAN_CATALOGUE_POSTGRES.md` §4 (schema) và §9.

## 2. "Upload ảnh (binary) lên Supabase Storage" — QUYẾT ĐỊNH: KHÔNG làm

`docs/PLAN_CATALOGUE_POSTGRES.md` đã chốt:

- §9 (dòng ~121): *"**Chỉ lưu LINK ảnh** (text) — không upload binary vào Storage. Vẫn phục vụ qua
  proxy `/img` + allowlist như hiện tại."*
- §9 checklist (dòng ~180): *"Upload ảnh vào Supabase Storage (**bạn chọn chỉ lưu link**)."*

Lý do hợp lý: proxy `/img` + cache CDN 1 năm đã đủ nhanh và không tốn dung lượng/băng thông Storage;
link ảnh nguồn ổn định (allowlist `vsmov.com`, `phimimg.com`, `image.tmdb.org`, `ex-cdn.com`).

## 3. Khi nào nên xem lại

Chỉ cân nhắc Supabase Storage nếu **ảnh nguồn chết hàng loạt** (đổi CDN/domain) hoặc cần ảnh
ổn định ngoài allowlist. Khi đó: tải ảnh → Storage → ghi lại `poster_url`/`thumb_url` trỏ về
Storage, và `/img` có thể bỏ. Hiện **chưa cần**.

---
Liên quan: `docs/PLAN_CATALOGUE_POSTGRES.md` (§4 schema, §9 quyết định ảnh), `src/pages/img.ts`.
