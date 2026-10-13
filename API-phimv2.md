NGUỒN C · API
Tài liệu API
Tra cứu phim, tập phim và danh sách cập nhật. Chọn một API để xem tham số hoặc mở URL mẫu.

8 API
GET
JSON
Không cần API key
Địa chỉ gốc
https://phim.nguonc.com/api

Sao chép
NỘI DUNG
Bắt đầu nhanh
Danh sách phim
2
Phim và tập phim
1
Bộ lọc dữ liệu
4
Tìm kiếm
1
Cấu trúc phản hồi
Lưu ý tích hợp
“Thử ngay” mở dữ liệu JSON trong tab mới.

Bắt đầu nhanh
Lấy danh sách mới cập nhật, sau đó dùng slug để xem chi tiết phim.

cURL
JavaScript
PHP
cURL
Sao chép mã
curl --fail --max-time 15 -H "Accept: application/json" "https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1"
Tìm trong tài liệu
Tên API, đường dẫn, tham số…
8 API có sẵn
01
Danh sách phim
Lấy phim mới hoặc duyệt theo trạng thái phát hành.

GET
Phim mới cập nhật
Trả về danh sách phim được cập nhật gần nhất, sắp xếp theo thời gian.

/films/phim-moi-cap-nhat?page={page}
Tham số
Tham số của Phim mới cập nhật
Tên	Kiểu	Mô tả
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=1
Sao chép
Thử ngay
GET
Phim theo danh mục
Lọc danh sách theo danh mục như tv shows, phim bộ hoặc phim lẻ.

/films/danh-sach/{slug}?page={page}
Tham số
Tham số của Phim theo danh mục
Tên	Kiểu	Mô tả
slug	string	Slug của danh mục phim.
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/danh-sach/tv-shows?page=1
Sao chép
Thử ngay
02
Phim và tập phim
Đọc thông tin chi tiết cùng danh sách máy chủ và tập phim.

GET
Chi tiết phim
Trả về thông tin phim, mã và liên kết TMDB/IMDb đã lưu cùng danh sách tập hiện có.

/film/{slug}
Tham số
Tham số của Chi tiết phim
Tên	Kiểu	Mô tả
slug	string	Slug duy nhất của phim.
URL mẫu
https://phim.nguonc.com/api/film/hoa-thien-cot
Sao chép
Thử ngay
03
Bộ lọc dữ liệu
Duyệt kho phim theo thể loại, quốc gia, năm phát hành hoặc ngôn ngữ.

GET
Phim theo thể loại
Lọc phim theo slug thể loại, ví dụ hành động hoặc tình cảm.

/films/the-loai/{slug}?page={page}
Tham số
Tham số của Phim theo thể loại
Tên	Kiểu	Mô tả
slug	string	Slug thể loại.
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/the-loai/hanh-dong?page=1
Sao chép
Thử ngay
GET
Phim theo quốc gia
Lọc phim theo quốc gia hoặc khu vực sản xuất.

/films/quoc-gia/{slug}?page={page}
Tham số
Tham số của Phim theo quốc gia
Tên	Kiểu	Mô tả
slug	string	Slug quốc gia hoặc khu vực.
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/quoc-gia/viet-nam?page=1
Sao chép
Thử ngay
GET
Phim theo năm
Lọc phim theo năm phát hành được lưu trong hệ thống.

/films/nam-phat-hanh/{year}?page={page}
Tham số
Tham số của Phim theo năm
Tên	Kiểu	Mô tả
year	integer	Năm phát hành gồm bốn chữ số.
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/nam-phat-hanh/2026?page=1
Sao chép
Thử ngay
GET
Phim theo ngôn ngữ
Lọc phim Vietsub, thuyết minh hoặc lồng tiếng. Phim có nhiều nhãn xuất hiện trong các bộ lọc tương ứng.

/films/ngon-ngu/{slug}?page={page}
Tham số
Tham số của Phim theo ngôn ngữ
Tên	Kiểu	Mô tả
slug	string	vietsub (Vietsub), thuyet-minh (Thuyết minh) hoặc long-tieng (Lồng tiếng).
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/ngon-ngu/vietsub?page=1
Sao chép
Thử ngay
04
Tìm kiếm
Tìm phim nhanh bằng tên hiển thị hoặc tên gốc.

GET
Tìm kiếm phim
Tìm các phim phù hợp với từ khóa và nhận kết quả phân trang.

/films/search?keyword={keyword}&page={page}
Tham số
Tham số của Tìm kiếm phim
Tên	Kiểu	Mô tả
keyword	string	Tên phim hoặc từ khóa cần tìm.
page	integer	Trang cần lấy.
URL mẫu
https://phim.nguonc.com/api/films/search?keyword=Regeneration&page=1
Sao chép
Thử ngay
Cấu trúc phản hồi
Danh sách và chi tiết phim có cấu trúc khác nhau. Ví dụ bên dưới được rút gọn để dễ đọc.

status
success khi yêu cầu thành công; một số lỗi trả về error kèm message.
paginate
Thông tin phân trang: current_page, total_page, total_items, items_per_page.
items
Danh sách phim. Dùng slug của từng phim để gọi API chi tiết.
cat
Thông tin danh mục khi gọi API theo danh mục, thể loại, quốc gia hoặc năm.
movie
Chi tiết phim; episodes chứa các server, mỗi server có items là danh sách tập.
tmdb
Có trong mỗi phim ở items[] và movie: id (số nguyên), type (movie hoặc tv), season (số mùa; 0 là phần đặc biệt) và url (liên kết TMDB). Giá trị chưa có là null.
imdb
Gồm id (chuỗi bắt đầu bằng tt) và url (liên kết IMDb), hoặc null cho từng giá trị chưa có. Đây là mã phim, không phải điểm đánh giá.
Ví dụ: danh sách phim
Ví dụ: chi tiết phim và tập phim
Lưu ý tích hợp
Phân trang: dùng thông tin paginate trong phản hồi để tải trang tiếp theo.
Slug phim: lấy từ API danh sách hoặc tìm kiếm; URL mẫu chỉ dùng để minh họa.
Từ khóa: mã hóa giá trị tìm kiếm khi ghép URL, chẳng hạn bằng encodeURIComponent().
Lỗi: kiểm tra mã HTTP trước khi đọc JSON. 404 có thể là phim/bộ lọc không tồn tại; 422 là tham số không hợp lệ; 429 cần chờ trước khi thử lại.
Tốc độ: lưu tạm dữ liệu đã lấy, đặt thời gian chờ và tránh gửi nhiều yêu cầu trùng lặp.