import fs from 'node:fs/promises'
import path from 'node:path'
import satori from 'satori'
import type { ReactNode } from 'react'
import type { MovieDetail } from './types'

interface FontConfig {
  name: string
  weight: 400 | 700
  style: 'normal'
  data: ArrayBuffer
}

let fontCache: FontConfig[] | null = null

async function loadFonts(): Promise<FontConfig[]> {
  if (fontCache) return fontCache
  async function readFile(file: string): Promise<ArrayBuffer> {
    const p = path.join(process.cwd(), 'node_modules/@fontsource/be-vietnam-pro/files', file)
    const buf = await fs.readFile(p)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  }
  fontCache = [
    { name: 'BeVietnamPro', weight: 400, style: 'normal', data: await readFile('be-vietnam-pro-vietnamese-400-normal.woff') },
    { name: 'BeVietnamPro', weight: 700, style: 'normal', data: await readFile('be-vietnam-pro-vietnamese-700-normal.woff') },
  ]
  return fontCache
}

interface OGOptions {
  width?: number
  height?: number
}

const WIDTH = 1200
const HEIGHT = 630

function sanitizeText(s: string | undefined | null, max = 90): string {
  const clean = (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + '…' : clean
}

export async function renderOGImage(movie: MovieDetail, opts: OGOptions = {}): Promise<Buffer> {
  const width = opts.width || WIDTH
  const height = opts.height || HEIGHT

  const fonts = await loadFonts()

  const name = sanitizeText(movie.name, 42)
  const origin = sanitizeText(movie.origin_name, 60)
  const year = movie.year ? String(movie.year) : ''
  const quality = movie.quality ? String(movie.quality) : ''
  const time = movie.time ? String(movie.time) : ''
  const vote = movie.tmdb?.vote_average && Number(movie.tmdb.vote_average) > 0 ? String(movie.tmdb.vote_average) : ''

  const poster = movie.poster_url || movie.thumb_url || ''
  const posterUrl = poster.startsWith('http') ? poster : `https://vsmov.com${poster.startsWith('/') ? poster : `/${poster}`}`

  const metaLine = [year, quality, time].filter(Boolean).join('  •  ')
  const voteLine = vote ? `★ ${vote} / 10` : ''

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width,
          height,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          backgroundColor: '#0a0a14',
          fontFamily: 'BeVietnamPro',
          position: 'relative',
          overflow: 'hidden',
        },
        children: [
          // background glow
          {
            type: 'div',
            props: {
              style: {
                position: 'absolute',
                inset: 0,
                display: 'flex',
                background:
                  'radial-gradient(60% 80% at 12% 18%, rgba(255,107,157,0.35) 0%, transparent 60%), radial-gradient(55% 75% at 88% 20%, rgba(74,158,255,0.35) 0%, transparent 60%), radial-gradient(60% 70% at 70% 90%, rgba(196,75,237,0.3) 0%, transparent 60%), linear-gradient(160deg, #0b0a1c 0%, #0a0a14 60%, #0c0a1a 100%)',
              },
              children: [],
            },
          },
          // text column
          {
            type: 'div',
            props: {
              style: {
                position: 'relative',
                flex: '1 1 auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                paddingLeft: 64,
                paddingRight: 40,
                paddingTop: 40,
                paddingBottom: 40,
                gap: 12,
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: {
                            display: 'flex',
                            padding: '8px 18px',
                            borderRadius: 999,
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            color: '#ffffff',
                            fontSize: 22,
                            fontWeight: 700,
                            letterSpacing: 1,
                          },
                          children: [`${year ? `${year}  ·  ` : ''}Nô Lệ Làm Phim`],
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      fontSize: 72,
                      fontWeight: 700,
                      color: '#ffffff',
                      lineHeight: 1.15,
                      textWrap: 'balance',
                    },
                    children: [name],
                  },
                },
                origin
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          fontSize: 30,
                          color: 'rgba(255,255,255,0.55)',
                          marginTop: 8,
                        },
                        children: [origin],
                      },
                    }
                  : null,
                (metaLine || voteLine)
                  ? {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 16,
                          marginTop: 16,
                        },
                        children: [
                          metaLine
                            ? {
                                type: 'span',
                                props: {
                                  style: { fontSize: 26, color: 'rgba(255,255,255,0.7)' },
                                  children: [metaLine],
                                },
                              }
                            : null,
                          voteLine
                            ? {
                                type: 'span',
                                props: {
                                  style: {
                                    display: 'flex',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    padding: '6px 14px',
                                    borderRadius: 999,
                                    background: 'linear-gradient(90deg, rgba(255,107,157,0.85), rgba(196,75,237,0.85))',
                                    color: '#ffffff',
                                    fontSize: 24,
                                    fontWeight: 700,
                                  },
                                  children: [voteLine],
                                },
                              }
                            : null,
                        ].filter(Boolean),
                      },
                    }
                  : null,
              ].filter(Boolean),
            },
          },
          // poster column
          posterUrl
            ? {
                type: 'div',
                props: {
                  style: {
                    flex: '0 0 auto',
                    width: 300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingRight: 48,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: 250,
                          height: 370,
                          display: 'flex',
                          borderRadius: 20,
                          backgroundColor: 'rgba(24,24,48,0.6)',
                          border: '2px solid rgba(255,255,255,0.25)',
                          boxShadow: '0 24px 60px -20px rgba(0,0,0,0.8)',
                          overflow: 'hidden',
                        },
                        children: [
                          {
                            type: 'img',
                            props: {
                              src: posterUrl,
                              width: 250,
                              height: 370,
                              style: { width: 250, height: 370, objectFit: 'cover' },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              }
            : null,
        ].filter(Boolean),
      },
    } as unknown as ReactNode,
    {
      width,
      height,
      fonts,
    },
  )

  const { Resvg } = await import('@resvg/resvg-js')
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: '#0a0a14',
  })
  const png = resvg.render()
  return Buffer.from(png.asPng())
}
