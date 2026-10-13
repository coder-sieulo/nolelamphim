# PLAN G3 — Hoàn thiện phòng **Xem Chung** (sync thật bằng `<video>` + m3u8)

> Trạng thái: **CHỜ DUYỆT** — chưa code.
> Phạm vi: `xem-chung` (phòng + API + player). **Không** đụng URL SEO / trang xem lẻ.
> Mục tiêu: phòng xem chung *thật sự* đồng bộ (play/pause/seek/tua), thay vì chỉ chung giờ.

---

## 1. Hiện trạng (đã có gì)

| Hạng mục | Hiện tại |
|---|---|
| **Player trong phòng** | `<iframe>` embed (cross-origin) — **không** điều khiển được |
| **Cơ chế sync** | "premiere clock": NTP offset `/api/xem-chung/time` + `startTime`; nút **Tái đồng bộ** = reload iframe |
| **Drift** | do buffer / ads / mạng → **không sửa được** vì iframe không expose `currentTime` |
| **Host** | chỉ **admin** (`ADMIN_IDS`): tạo phòng, chọn phim, đặt giờ, end |
| **Khán giả** | guest (localStorage `nllp_guest`) hoặc Discord; xem + chat; cấm mute/ban |
| **Lịch chiếu** | `scheduled` (tới `startTime` phát), chặn người vào muộn |
| **Khác** | chat, members, mute/ban, ready-gate auto-ignite, chia link |
| **Lưu trữ** | Redis 1 JSON `room:{code}`; client **poll 3s** |

**Vấn đề gốc:** mọi thứ dựa trên "cùng bấm lúc T" nhưng không ai kiểm soát được thời gian thật
trong player → lệch dần. Chỉ khi player là `<video>` do mình điều khiển thì mới sync được
(IDEA §13.3–13.4: kkphim `link_m3u8` = HLS 200, CORS `*`).

---

## 2. Mục tiêu G3

1. Khi phim có `m3u8` (kkphim): player đổi sang **`<video>` + hls.js**.
2. **Host = nguồn thời gian**: poll `video.currentTime`, broadcast lên server ~1s/lần.
3. **Members bám theo**: tính thời gian kỳ vọng, seek khi lệch, play/pause theo host.
4. Giữ **premiere clock** cho phòng hẹn giờ; phim **không** m3u8 → rơi về `<iframe>` như cũ.
5. Không phá schema Redis cũ (chỉ *thêm* field optional), không đổi URL, `astro check` 0 lỗi.

---

## 3. Thiết kế

### 3.1 Schema (chỉ THÊM, giữ field cũ)

```ts
// rooms.ts
interface RoomMovie { /* … cũ … */ m3u8?: string }

interface RoomSync {
  playing: boolean   // host đang phát?
  time: number       // currentTime (giây) tại thời điểm `at`
  at: number         // server ms khi ghi
  rate: number       // playbackRate (mặc định 1)
  seq: number        // +1 khi host seek/play/pause/đổi tập → member realign chắc chắn
  by: string         // host id
}
interface Room { /* … cũ … */ sync?: RoomSync }
```

> Phòng cũ đọc lên `sync` undefined → tự khởi tạo khi host phát lần đầu. Không cần migrate.

### 3.2 Server

| Việc | Chi tiết |
|---|---|
| `resolveEpisodeM3u8(slug, episodes)` | tái dùng `resolveIdentity(slug,'vsmov')` → `getKkphimDetail` → `buildM3u8Map`. Đặt trong `lib/` để cả `/xem` lẫn `/xem-chung` dùng chung |
| `/api/episodes` | **thêm `m3u8`** cho từng tập (để host picker lưu vào phòng) |
| `POST /api/xem-chung/[code]/sync` | **mới** — host ghi `{playing,time,rate,seq}`; server set `at=Date.now()` |
| `setMovie` / `presetMovie` | nhận thêm `m3u8` |
| `movie` / `from-movie` / `admin` POST | nhận thêm `m3u8` |
| `GET /api/xem-chung/[code]` | trả kèm `room.sync` (đã có sẵn vì trả cả room) |

### 3.3 Client (trang phòng)

```
movie.m3u8 ? <video>+hls.js : <iframe>   (giữ nguyên nhánh iframe cũ)
```

**Host**
- `<video controls>` (điều khiển tự do).
- Mỗi **1s**: `POST /sync {time, playing, rate, seq}`.
- Khi `seek`/`pause`/`play`/đổi tập → `seq++` rồi POST ngay (để member realign tức thì).

**Member**
- `<video>` **ẩn controls** + overlay "đang bám host"; có nút **Tự do** (unfollow) để xem lệch (tùy chọn).
- Poll `sync` **1s**:
  ```
  expected = sync.time + (sync.playing ? (now - sync.at)/1000 * rate : 0)
  if surface chưa có → nạp m3u8, seek expected, phát khi sync.playing
  else nếu |currentTime − expected| > 0.6s → seek(expected)
       nếu playing khác sync.playing → play()/pause()
  ```
- `seq` đổi → ép seek lại ngay (bỏ qua ngưỡng).

**Premiere clock (giữ)**
- Phòng `scheduled`: tới giờ host tự `play()` và bắt đầu push sync → member bám như trên.
- Không m3u8: giữ nguyên iframe + premiere + "Tái đồng bộ".

### 3.4 Vận hành / giới hạn
- Sync **chỉ host** ghi (`isHost`).
- Poll 1s chỉ **bật** khi status `playing` **và** có player video; ngoài ra giữ 3s.
  - Pilot 2–4 máy → free tier thừa. (SSE/WebSocket để giai đoạn sau nếu cần.)
- m3u8 hết hạn → host bấm chọn lại/`Tái đồng bộ`; ghi log để đo (giai đoạn sau: proxy stream).

---

## 4. Chia nhỏ (commit)

1. **schema + sync API** (`rooms.ts`, `POST /sync`, `resolveEpisodeM3u8`) — không đổi UI.
2. **player video trong phòng** (host broadcast + member follow) — thay `#xc-frame` khi có m3u8.
3. **plumb m3u8**: `/api/episodes` + host picker + `movie/from-movie/admin` POST.
4. **polish**: overlay member "bám host"/"tự do", status sync, giữ nhánh iframe.

---

## 4. Gate kiểm thử

- `npx astro check` **0 errors** + build pass.
- **2 tab** (1 host, 1 member): play/pause/seek/tua → member bám **< 1s**.
- Đổi tập khi đang phát → cả phòng đổi đúng.
- Phòng `scheduled` tới giờ → tự phát, member bám.
- Phim **không** m3u8 → vẫn chạy `<iframe>` + premiere clock như hiện tại.
- Phòng cũ (không `sync`) mở lên không lỗi.

---

## 5. Câu hỏi mở (cần bạn chốt)

1. **Ai được host?** Giữ *chỉ admin*, hay mở cho **mọi user Discord đăng nhập** tạo phòng?
2. **Member có được "tự do"** (tạm unfollow để xem riêng) không, hay *khóa cứng* bám host?
3. **Realtime**: chấp nhận *polling 1s* cho pilot 2–4 máy chứ? (SSE về sau)
