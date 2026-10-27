// Sinh `src/lib/icon-strings.ts` thành các chuỗi SVG tĩnh.
//
// Vì sao: bản cũ import `react-icons` + `react-dom/server` rồi render icon ở
// runtime. Kết quả là mỗi trang đều tải ~220 KB JS (React + react-dom/server)
// chỉ để lấy vài chuỗi SVG → parse/execute tốn main-thread, chuyển trang giật.
//
// Chạy lại khi thêm/bớt icon:
//   node tools/gen-icon-strings.mjs
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  FaDiscord,
  FaTv,
  FaDice,
  FaDna,
  FaPlay,
  FaFilm,
  FaLink,
  FaComment,
  FaClock,
  FaShareNodes,
  FaBan,
  FaMicrophoneSlash,
  FaCrown,
  FaUsers,
  FaDoorOpen,
  FaCirclePlay,
  FaHeart,
  FaMagnifyingGlass,
  FaShuffle,
  FaStar,
  FaUser,
} from 'react-icons/fa6'
import { FiLogOut, FiShare2 } from 'react-icons/fi'
import { MdClose } from 'react-icons/md'

const registry = {
  discord: FaDiscord,
  tv: FaTv,
  dice: FaDice,
  dna: FaDna,
  play: FaPlay,
  film: FaFilm,
  link: FaLink,
  comment: FaComment,
  clock: FaClock,
  share: FaShareNodes,
  ban: FaBan,
  mute: FaMicrophoneSlash,
  crown: FaCrown,
  users: FaUsers,
  door: FaDoorOpen,
  circlePlay: FaCirclePlay,
  heart: FaHeart,
  search: FaMagnifyingGlass,
  shuffle: FaShuffle,
  star: FaStar,
  user: FaUser,
  logout: FiLogOut,
  shareFeather: FiShare2,
  close: MdClose,
}

const MARK = '__ICON_CLASS__'

const entries = Object.entries(registry).map(([name, Icon]) => {
  const markup = renderToStaticMarkup(React.createElement(Icon, { className: MARK, 'aria-hidden': 'true' }))
  if (!markup.includes(MARK)) throw new Error(`Icon "${name}" không nhận className`)
  return `  ${JSON.stringify(name)}: ${JSON.stringify(markup)},`
})

const out = `// AUTO-GENERATED bởi \`node tools/gen-icon-strings.mjs\` — ĐỪNG SỬA TAY.
//
// SVG được render sẵn thành chuỗi để bundle client không phải kéo theo
// react-icons + react-dom/server (~220 KB) chỉ để vẽ vài cái icon.

const CLASS_MARK = '${MARK}'

const REGISTRY: Record<string, string> = {
${entries.join('\n')}
}

export function iconString(name: string, className = ''): string {
  const markup = REGISTRY[name]
  if (!markup) return ''
  return markup.replace(CLASS_MARK, className)
}
`

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '../src/lib/icon-strings.ts')
writeFileSync(target, out)
console.log(`wrote ${target} (${entries.length} icons, ${out.length} bytes)`)
