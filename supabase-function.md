> Ghi chú này đã được làm rõ và đóng: xem **`web/docs/NOTE_POSTER_STORAGE.md`**.

Ý tưởng gốc (giữ lại để tham chiếu):
"dùng supabase để lưu db poster film, link poster film thay vì load craw film khi vào web theo
cơ chế serverless. dựa trên bảng db: …"

Kết luận: phần "lưu link poster vào DB thay vì crawl khi vào web" **đã xong** (catalogue
read-through + proxy `/img`); phần "upload binary lên Supabase Storage" đã **quyết định không làm**
(`web/docs/PLAN_CATALOGUE_POSTGRES.md` §9). Không cần code thêm.
