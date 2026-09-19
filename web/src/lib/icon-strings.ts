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
import type { IconType } from 'react-icons'

const registry: Record<string, IconType> = {
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

export function iconString(name: keyof typeof registry | string, className = ''): string {
  const Icon = registry[name]
  if (!Icon) return ''
  return renderToStaticMarkup(React.createElement(Icon, { className, 'aria-hidden': 'true' }))
}