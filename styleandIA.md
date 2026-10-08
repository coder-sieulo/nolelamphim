01. STYLE BRIEF
Concept

Tên style: CINEMA MINIMAL

Một giao diện streaming hiện đại, tối giản, ưu tiên poster + nội dung, hạn chế tối đa card, border, gradient và các thành phần trang trí.

Cảm giác tổng thể:

🎬 Điện ảnh
🌑 Dark mode mặc định
🧊 Tối giản
⚡ Phản hồi nhanh
🧠 Thông minh nhưng không “khoe chức năng”
📱 Mobile-first
🖥️ Desktop tận dụng không gian tốt

Tham chiếu tinh thần:

Netflix về khả năng khám phá
Letterboxd về tính điện ảnh
YouTube về khả năng tìm kiếm
Spotify về khả năng cá nhân hóa

Nhưng không copy visual của bất kỳ nền tảng nào.

02. NGUYÊN TẮC UI
1. Không làm UI để khoe chức năng

Ví dụ không cần:

[Watchlist]
[History]
[Collections]
[Recommendations]
[Trending]

trên homepage.

Thay vào đó:

Trang chủ

[ Tiếp tục xem ]

[ Dành cho bạn ]

[ Phim đang hot ]

[ Mới cập nhật ]

Các chức năng sâu nằm trong interaction.

2. Một thành phần — nhiều chức năng

Ví dụ poster:

Click

→ Xem phim

Hover

→ Quick Preview

Right click / nút ···

→ menu:

▶ Xem ngay
＋ Thêm danh sách
♡ Yêu thích
↗ Chia sẻ
⌁ Đánh dấu chưa xem

Như vậy UI vẫn sạch nhưng chức năng rất nhiều.

03. COLOR SYSTEM
Background
Primary      #0B0B0C
Secondary    #111113
Surface      #18181B
Elevated     #202024
Text
Primary      #F5F5F5
Secondary    #A1A1AA
Muted        #71717A
Accent

Chỉ một màu accent.

Ví dụ:

Accent       #E50914

Đỏ điện ảnh.

Nhưng không lạm dụng.

Accent chỉ dùng cho:

CTA
progress
selected state
active navigation
notification quan trọng
04. TYPOGRAPHY
Heading

Inter / Geist / SF Pro

Không dùng quá nhiều font.

H1 32–40px
H2 22–28px
H3 17–20px
Body 14–16px
Meta 12–13px

Font weight chủ yếu:

400
500
600
700
05. LAYOUT

Desktop:

┌───────────────────────────────────────────────────────┐
│ LOGO       Trang chủ  Phim  TV  Thể loại    🔍  👤  │
├───────────────────────────────────────────────────────┤
│                                                       │
│                   CONTENT                             │
│                                                       │
│                                                       │
└───────────────────────────────────────────────────────┘

Không sidebar mặc định.

Không quá nhiều navigation.

Header
Logo

Trang chủ
Phim
Series
Thể loại

                    🔍
                    🔔
                    Avatar

Khi scroll xuống:

Header chuyển thành compact header.

06. HOMEPAGE

Homepage cực đơn giản.

Hero

Chỉ một phim nổi bật:

┌────────────────────────────────────────────────────────┐
│                                                        │
│                    [ BACKDROP ]                        │
│                                                        │
│       INTERSTELLAR                                    │
│                                                        │
│       ⭐ 8.7   2014   2h49m   Sci-Fi                  │
│                                                        │
│       [ ▶ Xem ngay ]   [ + Danh sách ]                │
│                                                        │
└────────────────────────────────────────────────────────┘

Không nhồi 10 button.

07. CONTENT ROW

Mỗi section chỉ có:

Tiếp tục xem                              Xem tất cả →

Poster:

┌──────────────┐
│              │
│    POSTER    │
│              │
└──────────────┘
   Movie name
   2026 · 8.4

Không cần card quá nặng.

08. CONTINUE WATCHING

Đây là nơi UI có thêm chức năng nhưng vẫn đơn giản.

Poster có progress:

┌──────────────┐
│              │
│    POSTER    │
│              │
├──────────────┤
│████████░░░░░│
└──────────────┘

Breaking Bad
S02 E04
32 phút còn lại

Hover:

▶ Tiếp tục
↺ Xem lại
09. SEARCH

Search phải là trái tim của web.

Click 🔍:

Header biến thành:

┌─────────────────────────────────────────────────────┐
│ ←  🔍  Tìm phim, diễn viên, đạo diễn, thể loại... │
└─────────────────────────────────────────────────────┘

Gõ:

batman

Realtime:

PHIM

Batman
Batman Begins
The Batman
The Dark Knight

DIỄN VIÊN

Christian Bale
Robert Pattinson

ĐẠO DIỄN

Christopher Nolan

Không cần chuyển trang.

10. SEARCH RESULT

Có filter nhưng ẩn mặc định.

Batman

[ Phim ] [ Series ] [ Người ]

Bộ lọc ↓

Click Bộ lọc:

Năm
[ 2020 — 2026 ]

Thể loại
☐ Action
☐ Crime
☐ Drama
☐ Sci-Fi

Rating
──────●────

Ngôn ngữ
☐ English
☐ Korean
☐ Japanese
☐ Vietnamese
11. MOVIE DETAIL

Trang phim vẫn cực sạch.

┌────────────────────────────────────────────────────────┐
│                                                        │
│                  BACKDROP                              │
│                                                        │
│     THE BATMAN                                        │
│                                                        │
│     ⭐ 8.5   2022   2h56m                             │
│                                                        │
│     [ ▶ Xem ngay ] [ + ] [ ♡ ] [ ↗ ]                 │
│                                                        │
└────────────────────────────────────────────────────────┘

The Batman

Robert Pattinson · Zoë Kravitz · Colin Farrell

Một câu mô tả ngắn...

Bên dưới:

Tổng quan
Trailer
Diễn viên
Tập phim
Đánh giá
12. WATCH PAGE

Đây là nơi full chức năng nhưng UI phải cực sạch.

┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│                 VIDEO                        │
│                                              │
│                                              │
│──────────────────────────────────────────────│
│ ▶  ━━━━━━━━━━━━━━━●━━━━━━━━  42:31 / 1:58   │
│                                              │
│ ⚙  ⚙ Quality  CC  🔊  ⛶                    │
└──────────────────────────────────────────────┘

Có thể hỗ trợ:

Play / pause
Seek
Volume
Subtitle
Audio track
Quality
Playback speed
Picture-in-picture
Fullscreen
Skip intro
Next episode
Auto play
Keyboard shortcut

Nhưng chỉ hiển thị những gì cần thiết.

13. SMART PLAYER

Một điểm tạo khác biệt:

Khi xem phim:

10 seconds

Nếu nhận diện intro:

Bỏ qua intro

Nếu gần hết tập:

Tập tiếp theo trong 8s

Nếu người dùng dừng:

Bạn muốn tiếp tục từ 42:31?

14. PROFILE

Không làm dashboard khổng lồ.

Chỉ:

Andy

Tiếp tục xem
Danh sách của tôi
Lịch sử
Đánh giá
Bộ sưu tập
Cài đặt
15. MY LIST

Một grid đơn giản:

Danh sách của tôi

[ Tất cả ] [ Phim ] [ Series ]

┌───┐ ┌───┐ ┌───┐ ┌───┐
│   │ │   │ │   │ │   │
└───┘ └───┘ └───┘ └───┘

Có thể:

sort
filter
drag & drop
tạo collection
private/public collection
16. COLLECTION

Đây là chức năng ẩn khá hay.

User tạo:

“Phim xem lúc 2 giờ sáng”

hoặc:

“Christopher Nolan”

Collection:

PHIM XEM LÚC 2 GIỜ SÁNG

12 phim

[poster] [poster] [poster] ...

Có thể share collection.

17. RATING

Không dùng 5 sao.

Dùng:

😐   🙂   😮   🤯   ❤️

Hoặc điểm:

8.7 / 10

User có thể:

Rate + Review + Spoiler tag

18. SOCIAL FUNCTION

Có nhưng không biến web thành mạng xã hội.

User có thể:

Follow user
Follow actor
Follow director
Share movie
Share collection
Review
Like review

Trang profile người khác:

@andy

12 collections
86 reviews

Phim yêu thích

[poster][poster][poster]
19. NOTIFICATION

Không cần page riêng quá lớn.

🔔 click:

Thông báo

Christopher Nolan
Có phim mới

The Batman
đã được thêm vào danh sách

────────────

@someone
đã thích review của bạn
20. IA — INFORMATION ARCHITECTURE

Cấu trúc tổng:

WEB
│
├── HOME
│
├── DISCOVER
│   ├── Movies
│   ├── Series
│   ├── Trending
│   ├── Popular
│   ├── New Releases
│   └── Genres
│
├── SEARCH
│   ├── Movies
│   ├── Series
│   ├── Actors
│   ├── Directors
│   └── Genres
│
├── MOVIE
│   ├── Overview
│   ├── Episodes
│   ├── Cast
│   ├── Trailer
│   ├── Reviews
│   └── Related
│
├── WATCH
│   ├── Player
│   ├── Episodes
│   ├── Subtitles
│   ├── Audio
│   └── Recommendations
│
├── MY LIBRARY
│   ├── Continue Watching
│   ├── Watchlist
│   ├── History
│   ├── Favorites
│   └── Collections
│
├── COMMUNITY
│   ├── Reviews
│   ├── Users
│   └── Collections
│
└── PROFILE
    ├── Activity
    ├── Reviews
    ├── Collections
    ├── Following
    └── Settings
21. MOBILE IA

Mobile không cố nhét desktop xuống.

Bottom navigation chỉ có:

⌂        🔍        ＋        ♡        👤
Home   Search    Library   Activity  Profile

Library mở ra:

Tiếp tục xem
Danh sách
Lịch sử
Collection
22. HIDDEN FEATURES

Đây mới là phần “đơn giản nhưng full chức năng”.

Các chức năng không nằm trên UI chính:

Long press poster

→ Context menu.

Hover poster

→ Preview.

Double click

→ Add/remove favorite.

Keyboard
Space       Play/Pause
← →         Seek
F           Fullscreen
M           Mute
C           Subtitle
N           Next episode
/

→ Focus search.

?

→ Keyboard shortcuts.

Share URL

Có deep link:

/movie/the-dark-knight
/watch/the-dark-knight?ep=1
/collection/nolan
/user/andy
23. DESIGN SYSTEM
Radius

Không bo quá tròn.

Card: 8px
Button: 6px
Input: 6px
Modal: 12px
Shadow

Rất nhẹ.

Không dùng glassmorphism.

Border

Chỉ dùng khi cần phân vùng.

Animation

Nhanh:

120–180ms

Chỉ những transition quan trọng mới:

250–400ms
24. “LUẬT” CỦA UI

Mình sẽ đặt 7 luật cứng:

01. Không có component nào chỉ để trang trí.

02. Không có hơn 2 CTA chính trên một viewport.

03. Không dùng modal nếu có thể dùng drawer.

04. Không dùng sidebar nếu navigation có thể giải quyết bằng header.

05. Không hiển thị filter nếu user chưa cần.

06. Không bắt user đi qua nhiều trang để thực hiện một hành động đơn giản.

07. 80% chức năng nằm dưới surface, 20% chức năng nằm trên surface.
08. không dùng icon trong code 