Nguồn phim của kkphim.com
GET
Lấy danh sách phim mới cập nhật
Danh sách phim mới nhất theo định dạng cổ điển. Có 2 biến thể chi tiết hơn: thêm hậu tố -v2 và -v3 (bổ sung trường và ảnh IMDB/TMDB đầy đủ).

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/danh-sach/phim-moi-cap-nhat' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/danh-sach/phim-moi-cap-nhat
Phương thức
GET
Mô tả
Danh sách phim mới nhất theo định dạng cổ điển. Có 2 biến thể chi tiết hơn: thêm hậu tố -v2 và -v3 (bổ sung trường và ảnh IMDB/TMDB đầy đủ).


GET
Lấy danh sách phim của trang chủ
Đối với API này bạn sẽ được lấy những thông tin phim hiển thị ở trang chủ của KKPhim, bao giờ những phim được cập nhật hôm nay.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/home' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/home
Phương thức
GET
Mô tả
Đối với API này bạn sẽ được lấy những thông tin phim hiển thị ở trang chủ của KKPhim, bao giờ những phim được cập nhật hôm nay.



GET
Phim mới — định dạng v1
Danh sách "Phim Mới" thuộc khối Version 1, kèm khối seoOnPage, breadCrumb, params. Không cần slug. Hỗ trợ toàn bộ bộ lọc chung.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/danh-sach?page=1' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/danh-sach
Phương thức
GET
Mô tả
Danh sách "Phim Mới" thuộc khối Version 1, kèm khối seoOnPage, breadCrumb, params. Không cần slug. Hỗ trợ toàn bộ bộ lọc chung.


GET
Danh sách phim theo loại
Lấy phim theo danh sách, đây là API cũ của phiên bản trước đây. type nhận: phim-le, phim-bo, hoat-hinh, tv-shows, phim-chieu-rap.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/danh-sach/phim-bo' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/danh-sach/{type}
Phương thức
GET
Mô tả
Lấy phim theo danh sách, đây là API cũ của phiên bản trước đây. type nhận: phim-le, phim-bo, hoat-hinh, tv-shows, phim-chieu-rap.



GET
Danh sách theo loại — bộ lọc đầy đủ
Giống trên nhưng theo định dạng v1 đầy đủ (seoOnPage, breadCrumb, params.pagination) và hỗ trợ mọi tham số ở Bộ lọc & Sắp xếp.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/danh-sach/phim-le?country=han-quoc&year=2024' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/danh-sach/{type}
Phương thức
GET
Mô tả
Giống trên nhưng theo định dạng v1 đầy đủ (seoOnPage, breadCrumb, params.pagination) và hỗ trợ mọi tham số ở Bộ lọc & Sắp xếp.



GET
Thông tin phim
Chi tiết một phim theo slug, gồm thông tin phim và danh sách tập (episodes tách ngoài movie).

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/phim/ten-phim-slug' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/phim/{slug}
Phương thức
GET
Mô tả
Chi tiết một phim theo slug, gồm thông tin phim và danh sách tập (episodes tách ngoài movie).




GET
Thông tin phim theo ID
Như Format 1 nhưng tra cứu theo _id của phim thay vì slug.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/phim/id/665f0a1b2c3d4e5f' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/phim/id/{id}
Phương thức
GET
Mô tả
Như Format 1 nhưng tra cứu theo _id của phim thay vì slug.




GET
Thông tin phim theo TMDB
Tra cứu phim theo mã TheMovieDB. type là movie hoặc tv.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/tmdb/movie/299534' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/tmdb/{type}/{id}
Phương thức
GET
Mô tả
Tra cứu phim theo mã TheMovieDB. type là movie hoặc tv.



Thông tin phim theo IMDB
Tra cứu phim theo ID IMDB.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/imdb/title/tt36596650' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/imdb/title/{id}
Phương thức
GET
Mô tả
Tra cứu phim theo ID IMDB.





GET
Thông tin phim (v1)
Chi tiết phim theo định dạng v1 (Format 2), bọc trong data kèm seoOnPage, breadCrumb, item (chứa cả episodes).

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/phim/ten-phim-slug' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/phim/{slug}
Phương thức
GET
Mô tả
Chi tiết phim theo định dạng v1 (Format 2), bọc trong data kèm seoOnPage, breadCrumb, item (chứa cả episodes).




GET
Hình ảnh của phim
Danh sách hình ảnh (poster, backdrop…) của phim.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/phim/ten-phim-slug/images' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/phim/{slug}/images
Phương thức
GET
Mô tả
Danh sách hình ảnh (poster, backdrop…) của phim.



Diễn viên & ê-kíp
Danh sách diễn viên, đạo diễn và nhân sự của phim.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/phim/ten-phim-slug/peoples' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/phim/{slug}/peoples
Phương thức
GET
Mô tả
Danh sách diễn viên, đạo diễn và nhân sự của phim.




GET
Từ khóa của phim
Danh sách từ khóa (keywords) gắn với phim.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/phim/ten-phim-slug/keywords' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/phim/{slug}/keywords
Phương thức
GET
Mô tả
Danh sách từ khóa (keywords) gắn với phim.



Danh sách thể loại
Lấy toàn bộ thể loại (tên + slug). Cũng có bản v1: /v1/api/the-loai.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/the-loai' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/the-loai
Phương thức
GET
Mô tả
Lấy toàn bộ thể loại (tên + slug). Cũng có bản v1: /v1/api/the-loai.

GET
Phim theo thể loại
Danh sách phim thuộc một thể loại, hỗ trợ bộ lọc chung.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/the-loai/hanh-dong?page=1' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/the-loai/{slug}
Phương thức
GET
Mô tả
Danh sách phim thuộc một thể loại, hỗ trợ bộ lọc chung.


GET
Danh sách quốc gia
Lấy toàn bộ quốc gia (tên + slug). Cũng có bản v1: /v1/api/quoc-gia.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/quoc-gia' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/quoc-gia
Phương thức
GET
Mô tả
Lấy toàn bộ quốc gia (tên + slug). Cũng có bản v1: /v1/api/quoc-gia.



GET
Phim theo quốc gia
Danh sách phim thuộc một quốc gia, hỗ trợ bộ lọc chung.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/quoc-gia/han-quoc?year=2024' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/quoc-gia/{slug}
Phương thức
GET
Mô tả
Danh sách phim thuộc một quốc gia, hỗ trợ bộ lọc chung.



GET
Danh sách năm phát hành
Lấy danh sách năm phát hành, từ năm hiện tại về 1911 (mới nhất trước).

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/nam-phat-hanh' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/nam-phat-hanh
Phương thức
GET
Mô tả
Lấy danh sách năm phát hành, từ năm hiện tại về 1911 (mới nhất trước).



GET
Phim theo năm phát hành
Danh sách phim theo năm phát hành, hỗ trợ bộ lọc chung.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/nam/2024?category=hoat-hinh' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/nam/{year}
Phương thức
GET
Mô tả
Danh sách phim theo năm phát hành, hỗ trợ bộ lọc chung.



GET
Tìm kiếm phim
Tìm phim theo từ khóa; khớp cả tên tiếng Việt và tên gốc. Hỗ trợ bộ lọc chung và limit.

Language
Bash
Node.js
JavaScript
PHP
Python
Go
Java
Ruby
Swift

curl --request GET \
  --url 'https://phimapi.com/v1/api/tim-kiem?keyword=avengers&limit=10' \
  --header 'accept: application/json'
Tổng quan
Tham số
Phản hồi
Ví dụ
Endpoint
/v1/api/tim-kiem?keyword=[keyword]
Phương thức
GET
Mô tả
Tìm phim theo từ khóa; khớp cả tên tiếng Việt và tên gốc. Hỗ trợ bộ lọc chung và limit.