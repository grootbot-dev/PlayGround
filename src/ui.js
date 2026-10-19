import { BLOCKS, PLACEABLE } from './blocks.js'
import { renderBlockIcon } from './textures.js'

const iconCache = new Map()
function icon(blockId, size = 48) {
  const key = `${blockId}:${size}`
  let cached = iconCache.get(key)
  if (!cached) {
    cached = renderBlockIcon(blockId, size)
    iconCache.set(key, cached)
  }
  // cloneNode does not copy canvas pixels, so blit into a fresh canvas.
  const copy = document.createElement('canvas')
  copy.width = copy.height = size
  copy.getContext('2d').drawImage(cached, 0, 0)
  return copy
}

export class UI {
  constructor() {
    this.hotbarEl = document.getElementById('hotbar')
    this.statsEl = document.getElementById('stats')
    this.toastEl = document.getElementById('toast')
    this.paletteEl = document.getElementById('palette')
    this.paletteGrid = document.getElementById('paletteGrid')

    this.slots = []
    this.blockIds = PLACEABLE.slice(0, 9)
    this.active = 0
    this.onSelect = null
    this.onRequestUnlock = null

    this.buildHotbar()
    this.buildPalette()
    this._toastTimer = null
  }

  buildHotbar() {
    this.hotbarEl.innerHTML = ''
    this.slots = []
    this.blockIds.forEach((id, i) => {
      const slot = document.createElement('button')
      slot.type = 'button'
      slot.className = 'slot'
      slot.title = BLOCKS[id].name
      const num = document.createElement('span')
      num.className = 'num'
      num.textContent = String(i + 1)
      slot.appendChild(num)
      slot.appendChild(icon(id, 48))
      slot.addEventListener('click', (e) => {
        e.stopPropagation()
        this.setActive(i)
      })
      this.hotbarEl.appendChild(slot)
      this.slots.push(slot)
    })
    this.setActive(0)
  }

  buildPalette() {
    this.paletteGrid.innerHTML = ''
    PLACEABLE.forEach((id) => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'pitem'
      item.title = BLOCKS[id].name
      item.appendChild(icon(id, 56))
      const label = document.createElement('span')
      label.textContent = BLOCKS[id].name
      item.appendChild(label)
      item.addEventListener('click', () => {
        this.blockIds[this.active] = id
        this.refreshSlot(this.active)
        this.setActive(this.active)
        this.togglePalette(false)
        this.onSelect?.(id)
      })
      this.paletteGrid.appendChild(item)
    })
  }

  refreshSlot(i) {
    const slot = this.slots[i]
    if (!slot) return
    const old = slot.querySelector('canvas')
    if (old) old.remove()
    slot.appendChild(icon(this.blockIds[i], 48))
    slot.title = BLOCKS[this.blockIds[i]].name
  }

  setActive(i) {
    this.active = ((i % this.blockIds.length) + this.blockIds.length) % this.blockIds.length
    this.slots.forEach((s, idx) => s.classList.toggle('active', idx === this.active))
    this.onSelect?.(this.blockIds[this.active])
  }

  cycle(delta) {
    this.setActive(this.active + delta)
  }

  selectedBlock() {
    return this.blockIds[this.active]
  }

  togglePalette(show = this.paletteEl.classList.contains('hidden')) {
    this.paletteEl.classList.toggle('hidden', !show)
    if (show) this.onRequestUnlock?.()
  }

  paletteOpen() {
    return !this.paletteEl.classList.contains('hidden')
  }

  toast(message) {
    this.toastEl.textContent = message
    this.toastEl.classList.add('show')
    clearTimeout(this._toastTimer)
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1400)
  }

  setStats(text) {
    this.statsEl.textContent = text
  }
}
