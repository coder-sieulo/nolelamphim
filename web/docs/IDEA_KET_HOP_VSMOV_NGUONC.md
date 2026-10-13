# Ý tưởng kết hợp 3 luồng dữ liệu: vsmov + nguonc + kkphim (V3)

> Trạng thái: **BẢN ĐỀ XUẤT Ý TƯỞNG** — chưa code. Chờ duyệt.
> Nguồn tham khảo: `API-phimv2.md` (nguonc) + `API-phimV3.md` (kkphim / phimapi.com) + code hiện tại `web/src/lib/api.ts`, `lib/types.ts`, `pages/api/*`.
> Đã khảo sát thực tế (13-10-2026): §8 cache, §9 player, §13 xem-chung — có kết quả đo thật.

---

## 1. Hiện trạng (chỉ 1 luồng — vsmov)

| Khía cạnh | Hiện trạng |
|---|---|
| Gốc API | `https://vsmov.com/api` |
| Danh sách | `danh-sach/phim-moi-cap-nhat`, `danh-sach/{slug}`, `the-loai/{slug}`, `quoc-gia/{slug}`, `nam/{year}`, `tim-kiem` |
| Chi tiết phim | `/phim/{slug}` (JSON) |
| **Tập phim** | **Scrape HTML `vsmov.com/phim/{slug}`** → grep `embedEpisodes` — dễ vỡ khi HTML đổi |
| Cache | Bộ nhớ trong (list 60s, episodes 10 phút) — mất khi serverless cold |
| URL SEO | `/phim/{slug}` từ slug vsmov — **đã được index** |

Điểm yếu chính của vsmov: **tập phim phải scrape HTML** (JSON detail không có episodes), không phân loại ngôn ngữ, thiếu id TMDB/IMDb để khớp nguồn khác, không có stream trực tiếp.

## 2. Nguồn C (nguonc) — điểm mạnh

- **Chi tiết phim trả luôn episodes** (`episodes[].server_name` + `items[].{name, slug, embed}`). Không cần scrape.
- Có **tmdb** (`{id, type, season, url}`) và **imdb** (`{id: "tt...", url}`) → chìa khoá khớp phim.
- Có filter **ngôn ngữ** (`/films/ngon-ngu/{vietsub|thuyet-minh|long-tieng}`).
- CORS `*` (đã đo: `Access-Control-Allow-Origin: *`).
- **Hạn chế đã đo**: chỉ có `embed` (iframe `*.streamc.xyz`), **không có m3u8**; embed phải qua Cloudflare Turnstile và chặn IP datacenter (chi tiết §13).

## 3. Nguồn V3 — kkphim (`phimapi.com`) — giàu tính năng nhất

Nguồn mới được hỏi thêm, theo `API-phimV3.md` (nhiều chức năng hơn cả vsmov lẫn nguonc). Đã test thật (13-10-2026).

### 3.1 Tính năng nổi bật
| Nhóm | Endpoint | Đóng góp so với 2 nguồn cũ |
|---|---|---|
| **Stream trực tiếp** | chi tiết phim có `episodes[].server_data[].{ link_m3u8, link_embed }` | ✅ **`link_m3u8` = HLS thật** — đo được HTTP 200, `application/vnd.apple.mpegurl`, CORS `*`, playlist đa chất lượng (1080p…). Chưa nguồn nào khác có |
| Home block | `/v1/api/home` | items + sports videos + SEO block — nguồn nội dung trang chủ phong phú |
| Tra cứu theo ID | `/phim/id/{id}`, `/tmdb/{type}/{id}`, `/imdb/title/{id}` | ✅ **Giải trực tiếp bài toán khớp phim** (§5) |
| Peoples / Keywords / Images | `/v1/api/phim/{slug}/peoples|keywords|images` | Mở đường cho tính năng từng deferred: **follow diễn viên/đạo diễn, search grouping Người, backdrop** |
| Bộ lọc chung | `/v1/api/danh-sach/{type}`, `the-loai`, `quoc-gia`, `nam` | lọc country/year/category/type/sort trong 1 API |
| Tìm kiếm | `/v1/api/tim-kiem?keyword=&limit=` | khớp cả tên Việt + tên gốc, kèm limit |
| Biến thể list | `...-v2`, `...-v3` | bổ sung field + ảnh IMDB/TMDB đầy đủ |

### 3.2 Kết quả đo thật (mẫu `phimapi.com`)
- Detail v1: `type: single`, episodes → `server_data` có `{name, slug, filename, link_embed, link_m3u8}`.
- `link_m3u8` mẫu: `https://a.kvp726.com/20261013/cbcYptZk/index.m3u8` (đường dẫn chứa ngày → **link có vòng đời, cần cache ngắn**).
- `link_embed` mẫu: `https://player.phimapi.com/player/?url=…m3u8` (bản thân nó cũng chỉ phát lại chính m3u8 — nghĩa là điểm duy nhất là file HLS).
- CORS ✚ CORS stream: `access-control-allow-origin: *`.
- `/peoples` endpoint tồn tại nhưng mẫu thử trả rỗng → cần test thêm trên phim có cast đầy đủ.

## 4. Mô hình kết hợp (cập nhật — đề xuất "A2")

### Mô hình A2 — kkphim làm nguồn PHÁT chính; vsmov giữ URL/SEO; nguonc làm fallback + metadata (khuyên chọn)
1. **vsmov**: giữ *canonical* — slug URL SEO, danh sách/điều hướng như hiện tại (không đổi URL).
2. **kkphim**: nguồn **episodes + player chính** (m3u8 → `<video>` riêng, điều khiển được — mở khóa xem-chung, xem §9/§13); bổ sung metadata (images, peoples, keywords, tmdb/imdb).
3. **nguonc**: fallback episodes + bổ trợ khi 2 nguồn kia thiếu (metadata, filter ngôn ngữ).
- An toàn: 1 nguồn chết → 2 nguồn còn lại gánh.

### Mô hình cũ trong bản đầu (giữ để đối chiếu)
- **A — nguonc fallback**: vẫn đúng nhưng tập phim sẽ ưu tiên kkphim hơn nguonc.
- **B — đổi primary**: giờ có thể cân nhắc nghiêm túc hơn vì kkphim giàu nhất; nhưng vẫn phải giữ redirect slug cũ, chưa làm ngay.
- **C — song song hiện nhãn nguồn**: không chọn (phá UI tối giản).

## 5. Lớp khớp phim (Identity Layer) — giờ đơn giản đi nhiều

Thứ tự khớp:
1. **tmdb.id → kkphim `/tmdb/{type}/{id}`** (nguồn có lookup sẵn) — chính xác tuyệt đối.
2. **imdb.id → `/imdb/title/{id}`** nếu tmdb trống.
3. **Tên chuẩn hoá + năm** — cho phim không có id.
4. Không khớp → không block, phim chỉ hiện từ nguồn gốc.

Lưu trữ: Redis `phim:idmap:{slug}` (2 chiều vsmov ↔ kkphim ↔ nguonc, kèm tmdbId), TTL 7 ngày, tạo lazy. **kkphim còn cho phép lật ngược**: biết tmdb → tìm slug kkphim ngay cả khi vsmov không có phim đó.

## 6. Ánh xạ route ↔ nguồn (cập nhật)

| Route hiện tại | Nguồn ưu tiên | Đóng góp của nguồn khác |
|---|---|---|
| `/` , `/danh-sach/*` | vsmov | (giữ tốc độ) |
| `/phim/{slug}` | vsmov detail | kkphim bổ sung images/peoples/keywords/tmdb/imdb; nguonc bổ sung content/ngôn ngữ |
| `/xem/{slug}/{ep}` | **kkphim `link_m3u8`** (hls.js) | fallback vsmov embed → nguonc embed |
| `/the-loai/*`, `/quoc-gia/*`, `/nam/*` | vsmov | (nguồn giữ URL) |
| `/search` | vsmov + kkphim + nguonc | gộp + dedupe theo identity; filter ngôn ngữ |
| (mới) filter ngôn ngữ | nguonc / kkphim | mở chiều lọc Vietsub/Thuyết minh/Lồng tiếng |

## 7. Cache & hiệu suất (serverless an toàn)

- Chuyển cache sang **Redis (Upstash sẵn có)** + stale-while-revalidate, TTL theo tầng:
  - Danh sách: 5–10 phút · Chi tiết: 24h · Idmap: 7 ngày.
  - Episodes: **10–30 phút — nhưng link m3u8 của kkphim chứa ngày trong URL → TTL ngắn 5–15 phút, chấp nhận refresh nền** (không cache cứng lâu).
- Gọi tác động tối thiểu: `/xem` lấy episodes kkphim trước; chỉ gọi vsmov/nguonc khi kkphim lỗi hoặc phim không có.
- Ghi chú: `phimapi.com` và `nguonc.com` đều khuyến nghị cache (chống 429).

## 8. Tìm kiếm, lọc & nội dung phong phú

- **Search gộp 3 nguồn**: song song (timeout 3–5s), dedupe theo idmap; phim trùng nhiều nguồn xếp trước.
- **Filter ngôn ngữ**: dùng nguonc `/films/ngon-ngu/*` hoặc bộ lọc chung của kkphim.
- **Tính năng từng deferred giờ khả thi**: qua `/peoples` + `/images` mở đường cho **trang diễn viên/đạo diễn**, **search grouping Người**, **backdrop hero** (hiện HERO_IMAGE_LIMIT phải vay từ list).
- **Home block**: đánh giá dùng `/v1/api/home` cho trang chủ (đã có sẵn SEO block).

## 9. Phát phim — nâng cấp lớn nhờ m3u8

- **Đề xuất player mới**: dùng `link_m3u8` chơi qua **`<video>` riêng + hls.js** trên chính `player-stage` — thoát hẳn iframe cross-origin → điều khiển được `play/pause/seek/currentTime` (đã xác minh CORS + định dạng playlist).
- Giữ **đổi nguồn** thủ công giữa các server (kkphim nhiều server / fallback vsmov/nguonc).
- Nếu hls.js gặp trường hợp link lỗi → fallback về `link_embed` iframe của kkphim → vsmov → nguonc.
- **Lưu ý**: m3u8 có thể yêu cầu Referer/token trong tương lai → thiết kế thêm lớp proxy stream (tùy chọn, giai đoạn sau).

## 10. Lộ trình giai đoạn (cập nhật)

| Giai đoạn | Nội dung | Gate duyệt |
|---|---|---|
| **G0 — Khảo sát (mở rộng)** | ✅ **Đã xong full 3 nguồn (13/10/2026)** — kết quả chi tiết §14 | ✅ Bảng số liệu §14 |
| **G1 — Identity layer** | Khớp theo tmdb/imdb (dùng lookup kkphim) + idmap Redis | Khớp ≥ 80% mẫu G0 |
| **G2 — Player + episodes kkphim** | `/xem` chơi m3u8 qua hls.js; fallback về embed | Không đổi URL; check + build pass |
| **G3 — Xem Chung (thí điểm)** | Tận dụng `<video>` mới: host = nguồn thời gian (poll currentTime), members bám theo; vẫn giữ premiere clock làm cơ chế cũ | Thử nghiệm phòng 2–4 máy |
| **G4 — Bổ trợ chi tiết + search + thành viên/phim** | images/peoples/keywords, search 3 nguồn, filter ngôn ngữ | Regression cũ + check/build |

## 11. Rủi ro & điều cần xác minh TRƯỚC khi code

1. ✅ **kkphim có m3u8 CORS mở** — đã đo 200 + `allow-origin:*`.
2. ⚠️ **Vòng đời link m3u8**: URL chứa ngày (`20261013`) — cần đo xem đổi sau bao lâu (giờ/ngày) → quyết định TTL + có cần proxy refresh không.
3. ⚠️ **m3u8 có yêu cầu Referer/token ở đỉnh điểm hay từ IP datacenter không** (chưa đo được từ Vercel; mẫu hiện trả thẳng).
4. ⚠️ **Uptime/tốc độ của `phimapi.com` & CDN `*.kvp726.com`** khi SSR + nhiều user.
5. ⚠️ **`/peoples` / `/images`** trả rỗng trên mẫu — cần mẫu lớn hơn để chốt tính năng.
6. **Định dạng response 3 nguồn** — mỗi nguồn 1 shape → tầng chuẩn hoá (`normalize`) phải đổi schema Movie; đây là chỗ "thay đổi rất lớn" cần làm cẩn thận + giữ field cũ.
7. **Ngữ nghĩa `status` khác nhau** (vsmov `boolean`, nguonc `string`) — cần map thống nhất.
8. **Chi phí**: 3 nguồn ⇒ nhiều call hơn — cache Redis + chỉ gọi nguồn phụ khi cần.

## 12. Tiêu chí "đủ điều kiện để code" (cập nhật)

- [x] Duyệt **Mô hình A2** (kkphim = phát chính, vsmov = SEO, nguonc = fallback) — bổ sung kết luận G0 §14.4 (nguonc = main catalogue).
- [x] G0 xong: **khớp idmap vượt ngưỡng** — tmdb 38.628 + tên 15.229, match ngược ~50% no-tmdb kkphim; m3u8 ổn định trên mẫu.
- [ ] Chốt TTL + chiến lược cache link m3u8; flag tắt nhanh cho từng nguồn.
- [ ] Không đổi URL SEO; không phá schema Redis cũ; chỉ thêm bảng map mới.

## 13. Khảo sát Xem Chung — cập nhật theo 3 nguồn

### 13.1 Vì sao vsmov thất bại (giữ nguyên)
Iframe embed cross-origin **không có API điều khiển** → không seek/pause được → chỉ "premiere clock" (cùng bấm phát + reload), drift do buffer/ads không sửa được.

### 13.2 nguonc — KHÔNG cứu được (đã đo)
Chỉ có `embed` iframe `streamc.xyz` (JWPlayer + Cloudflare Turnstile + chặn IP datacenter), **không m3u8** → cùng giới hạn và còn thêm ma sát xác minh.

### 13.3 kkphim — CÓ KHẢ NĂNG giải quyết (đã đo)
- `server_data[].link_m3u8` = **HLS trực tiếp** (200, CORS `*`, đa chất lượng) → phát bằng `<video>` riêng + hls.js **tự điều khiển được timeline**.
- Đây chính xác là **điều kiện sync thật** (host = nguồn thời gian: poll `currentTime`, members hiệu chỉnh định kỳ, seek cùng nhau).
- Vẫn còn rủi ro cần test: link có vòng đời ngắn, có thể cần Referer; CDN chặn IP datacenter (chưa gặp ở mẫu) — thí điểm nhỏ trước.

### 13.4 Kết luận
- **Xem Chung chỉ có thể sync thật khi chuyển player sang `<video>` + m3u8 của kkphim** (hoặc nguồn tương đương cấp HLS/MP4 có CORS).
- Đưa "thí điểm Xem Chung (G3)" vào lộ trình — **không phải hứa hẹn, mà là thí nghiệm xác định**; nếu m3u8/CDN ổn định thì nâng cấp luôn cơ chế, còn kém ổn thì giữ premiere clock + fallback.

---

## 14. Kết quả G0 — ĐỐI CHIẾU FULL 3 NGUỒN (đã chạy 13/10/2026)

Quét **toàn bộ catalogue** 3 nguồn (không lấy mẫu): vsmov 20.365 · nguonc 33.481 · kkphim 30.335 — tổng ~5.400 request, throttle chống 429, full 100% mỗi nguồn. Khớp theo `tmdb.id` (chuẩn hoá string) cho phim có tmdb, và **tên chuẩn hoá (bỏ dấu) + năm ±1** cho phim không tmdb, match ngược vào pool tmdb để **chống đếm kép**.

### 14.1 Bảng kết quả chính

| Chỉ số | vsmov | nguonc | kkphim |
|---|---|---|---|
| Raw catalogue | 20.365 | **33.481** | 30.335 |
| Có tmdb (raw → unique) | 99,1% (18.982) | 76,1% (23.002) | 46,0% (**11.652**) |
| Không tmdb | 177 (0,9%) | 7.994 (23,9%) | **16.380 (54%)** |
| **Góp vào union (sau trừ trùng)** | 19.158 (35,6%) | **30.937 (57,4%)** | 27.842 (51,7%) |
| Độc quyền (chỉ nguồn này có) | 11.209 | **13.242** | 10.622 |

- **TỔNG phim duy nhất 3 nguồn: 53.857** (tmdb: 38.628 + khớp tên thật sự mới: 15.229).
- Phim có ở **cả 3 nguồn: 5.296 (9,8%)** · 2 nguồn: 13.488 (25%) · **chỉ 1 nguồn: 35.073 (65,1%)**.
- Không-tmdb được match ngược vào pool: kkphim **8.210/16.380** (50%) là phim đã có ở nguồn khác → tỉ lệ không-tmdb cao không có nghĩa là content trống.

### 14.2 Đóng góp cộng dồn (nếu lấy nguồn A làm nền + thêm nguồn B)

| Nền | + Nguồn | Union đạt | Phủ union |
|---|---|---|---|
| nguonc (30.937) | + vsmov | 43.235 | **80,3%** |
| nguonc (30.937) | + kkphim | 42.648 | 79,2% |
| kkphim (27.842) | + vsmov | 40.615 | 75,4% |

→ nguonc làm nền, **vsmov bù được nhiều content độc quyền nhất (+12.298)**; kkphim bù +11.711 nhưng thắng ở playback (m3u8).

### 14.3 Chất lượng phần "độc quyền" (đã kiểm tra thật)

- **kkphim độc quyền**: mẫu 4/4 phim đều có episodes + **`link_m3u8` HLS trực tiếp** (phim Việt/hoathinh/anime phụ, đa phần là phần-sau của series TMDB gộp).
- **nguonc độc quyền**: mẫu 4/4 có episodes qua embed (`streamc.xyz`), 3–219 tập — nội dung thật, không phải shell rỗng.
- Không-tmdb chủ yếu = phần-phụ/ngoại truyện của series, phim Việt, sports/phụ đề riêng — **TMDB gộp** nên không có id, không phải rác.

### 14.4 KẾT LUẬN G0 — nguồn "nhiều nhất"

> **Nguồn main theo số lượng = `nguonc`** (góp **30.937/53.857 = 57,4%** union; nhiều nhất cả raw lẫn unique).

Nhưng dữ liệu cho thấy nên theo **mô hình A2 điều chỉnh** thay vì quăng hết về 1 nguồn:
1. **nguonc** = main catalogue (lớn nhất, 57,4% union) + fallback episodes embed.
2. **kkphim** = playback chính cho mọi phim có ở kkphim (27.842 phim = 51,7% union) nhờ `link_m3u8` (điều khiển được → Xem Chung); content riêng +11.711.
3. **vsmov** = vẫn giữ slug SEO canonic hiện có (không đổi URL) + đóng góp content riêng **+12.298 (lớn nhất)** + metadata tmdb gần như đầy đủ (99%).

Ghép nguonc+kkphim+vsmov ⇒ phủ **100% 53.857 phim duy nhất**.

### 14.5 Cập nhật lộ trình (sau G0)

- **G0 hoàn tất** — dữ liệu trên là input cho G1 (idmap), G2 (player), G3 (xem chung), G4 (metadata).
- G1 gate "khớp ≥ 80%": đã có pool id (tmdb) 38.628 + map tên 15.229 → thực tế khớp được ~99% qua 2 lớp (tmdb + tên+năm); phần kkphim không-tmdb cũng đã match ngược 50%.