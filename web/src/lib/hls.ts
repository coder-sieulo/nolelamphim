/**
 * Nhận diện link HLS **thật**.
 *
 * Lưu ý quan trọng: trường `m3u8` của nguồn vsmov KHÔNG phải HLS — đó là link
 * embed/stream (vd `s3.streamvsmov.com/video/...`, `vsmov.com`). Chỉ link kkphim
 * (qua `buildM3u8Map`) mới là `.m3u8` phát được bằng hls.js.
 */
export function isRealHls(url?: string | null): url is string {
  if (!url) return false
  return /^https?:\/\//i.test(url) && /\.m3u8(?:[?#]|$)/i.test(url)
}
