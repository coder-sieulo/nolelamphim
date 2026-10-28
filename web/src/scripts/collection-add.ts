import { registerPageInit } from './lifecycle'
import { getMe } from './session'

function initCollectionAdd() {
  registerPageInit(() => {
    document.body.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('.mc-add-collection')
      if (!btn) return
      e.preventDefault()
      e.stopPropagation()
      void (async () => {
        const me = await getMe()
        if (!me.user) {
          window.location.href = '/dang-nhap'
          return
        }
        try {
          const res = await fetch('/api/collections', { credentials: 'same-origin' })
          const d = await res.json()
          const list = d.collections || []
          if (list.length === 0) {
            if (confirm('Bạn chưa có bộ sưu tập nào. Tạo bộ sưu tập ngay?')) {
              window.location.href = '/profile'
            }
            return
          }
          const names = list.map((c: any, i: number) => `${i + 1}. ${c.title} (${c.count || 0})`).join('\n')
          const choice = prompt(`Thêm vào bộ sưu tập:\n${names}\n\nNhập số thứ tự:`)
          const idx = Number(choice) - 1
          if (idx < 0 || idx >= list.length) return
          const col = list[idx]
          const addRes = await fetch(`/api/collections/${col.id}/items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              movieExtId: Number(btn.dataset.extId),
              slug: btn.dataset.slug,
              name: btn.dataset.name,
              thumb: btn.dataset.thumb,
              tmdbVote: btn.dataset.tmdb || null,
              year: btn.dataset.year || null,
              quality: btn.dataset.quality || null,
            }),
          })
          const ad = await addRes.json()
          if (ad.ok) alert('Đã thêm vào bộ sưu tập')
          else alert(ad.error || 'Không thêm được')
        } catch {
          alert('Không thêm được')
        }
      })()
    })
  })
}

initCollectionAdd()
