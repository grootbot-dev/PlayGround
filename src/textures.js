import * as THREE from 'three'
import { TILES, TILE, BLOCKS } from './blocks.js'
import { mulberry32 } from './noise.js'

export const TILE_SIZE = 16
export const ATLAS_COLS = 8
export const ATLAS_ROWS = Math.ceil(TILES.length / ATLAS_COLS)

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0)

function makeTileCanvas(size = TILE_SIZE) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

// Small helper that gives each tile a private seeded RNG + pixel buffer.
function paint(name, fn) {
  const canvas = makeTileCanvas()
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(TILE_SIZE, TILE_SIZE)
  const d = img.data
  const rng = mulberry32(0x9e3779b9 ^ [...name].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7))
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= TILE_SIZE || y >= TILE_SIZE) return
    const i = (y * TILE_SIZE + x) * 4
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b); d[i + 3] = clamp(a)
  }
  const mix = (base, jitter) => base + (rng() * 2 - 1) * jitter
  const noise = { rng, set, mix }
  fn(noise, TILE_SIZE)
  ctx.putImageData(img, 0, 0)
  return canvas
}

function speckleBase(set, base, jitter, rng) {
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const j = (rng() * 2 - 1) * jitter
      set(x, y, base[0] + j, base[1] + j, base[2] + j)
    }
  }
}

function lumps(set, count, color, rng, radius = 1.6) {
  for (let i = 0; i < count; i++) {
    const cx = rng() * TILE_SIZE
    const cy = rng() * TILE_SIZE
    const r = radius * (0.6 + rng() * 0.8)
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        const dist = Math.sqrt(dx * dx + dy * dy) + (rng() - 0.5) * 0.9
        if (dist < r) {
          const t = 0.75 + rng() * 0.5
          set(x, y, color[0] * t, color[1] * t, color[2] * t)
        }
      }
    }
  }
}

const drawers = {
  grass_top({ set, mix, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const tuft = rng() < 0.12 ? -22 : 0
        set(x, y, mix(96, 14) + tuft, mix(150, 16) + tuft, mix(64, 12) + tuft)
      }
  },
  dirt({ set, rng }) {
    speckleBase(set, [122, 88, 58], 16, rng)
    lumps(set, 4, [104, 72, 46], rng, 1.4)
  },
  grass_side({ set, rng }) {
    speckleBase(set, [122, 88, 58], 15, rng)
    lumps(set, 3, [104, 72, 46], rng, 1.3)
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = 3 + Math.floor(rng() * 3)
      for (let y = 0; y < edge; y++) {
        const tuft = rng() < 0.15 ? -20 : 0
        set(x, y, 92 + tuft, 148 + tuft, 60 + tuft)
      }
    }
  },
  snow_side({ set, rng }) {
    speckleBase(set, [122, 88, 58], 15, rng)
    for (let x = 0; x < TILE_SIZE; x++) {
      const edge = 4 + Math.floor(rng() * 3)
      for (let y = 0; y < edge; y++) {
        const j = (rng() * 2 - 1) * 10
        set(x, y, 238 + j, 244 + j, 250 + j)
      }
    }
  },
  snow({ set, mix }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(238, 8), mix(245, 7), mix(251, 6))
  },
  stone({ set, rng }) {
    speckleBase(set, [130, 130, 130], 12, rng)
    lumps(set, 3, [112, 112, 112], rng, 1.6)
  },
  cobble({ set, rng }) {
    speckleBase(set, [96, 96, 96], 8, rng)
    const c = [[0, 0], [6, 0], [0, 6], [6, 6], [3, 3], [0, 3], [6, 3], [3, 0], [3, 6], [0, 6]]
    for (const [ox, oy] of c) {
      const shade = 120 + rng() * 55
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < 6; x++) {
          const dx = x - 2.5, dy = y - 2.5
          if (dx * dx + dy * dy > 9) continue
          const t = 1 + (rng() - 0.5) * 0.18
          set(ox + x, oy + y, shade * t, shade * t, shade * t * 0.98)
        }
    }
  },
  sand({ set, mix, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const g = rng() < 0.06 ? -16 : 0
        set(x, y, mix(224, 10) + g, mix(208, 10) + g, mix(152, 12) + g)
      }
  },
  sandstone_top({ set, mix }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(222, 7), mix(206, 7), mix(150, 8))
  },
  sandstone_side({ set, mix, rng }) {
    for (let y = 0; y < TILE_SIZE; y++) {
      const band = y < 4 ? -8 : y > 12 ? -14 : 0
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(222, 6) + band, mix(206, 6) + band, mix(150, 7) + band)
    }
    for (let x = 0; x < TILE_SIZE; x += 5) {
      for (let y = 0; y < 4; y++) set(x, y, 150, 132, 92)
    }
  },
  log_side({ set, rng }) {
    speckleBase(set, [110, 82, 44], 10, rng)
    for (let x = 0; x < TILE_SIZE; x++) {
      const streak = (rng() * 2 - 1) * 26
      for (let y = 0; y < TILE_SIZE; y++) {
        const j = (rng() * 2 - 1) * 6
        set(x, y, 110 + streak + j, 82 + streak * 0.8 + j, 44 + streak * 0.5 + j)
      }
    }
  },
  log_top({ set, rng }) {
    speckleBase(set, [150, 116, 66], 8, rng)
    for (let y = 0; y < TILE_SIZE; y++) {
      for (let x = 0; x < TILE_SIZE; x++) {
        const dx = x - 7.5, dy = y - 7.5
        const r = Math.sqrt(dx * dx + dy * dy)
        const ring = Math.sin(r * 2.1) * 0.5 + 0.5
        const shade = 140 + ring * 40 + (rng() - 0.5) * 10
        set(x, y, shade, shade * 0.78, shade * 0.45)
      }
    }
  },
  leaves({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        if (rng() < 0.16) { set(x, y, 0, 0, 0, 0); continue }
        const t = 0.7 + rng() * 0.6
        set(x, y, 52 * t, 122 * t, 40 * t)
      }
  },
  spruce_leaves({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        if (rng() < 0.2) { set(x, y, 0, 0, 0, 0); continue }
        const t = 0.72 + rng() * 0.55
        set(x, y, 40 * t, 92 * t, 58 * t)
      }
  },
  planks({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const grain = Math.sin(x * 0.9 + y * 0.15) * 8 + (rng() * 2 - 1) * 8
        set(x, y, 178 + grain, 138 + grain, 78 + grain)
      }
    for (let y = 0; y < TILE_SIZE; y += 4) {
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, 128, 94, 50)
    }
    for (let x = 0; x < TILE_SIZE; x += 8) {
      const off = (x / 8) % 2 === 0 ? 0 : 2
      for (let y = off; y < Math.min(TILE_SIZE, off + 4); y++) set(x, y, 128, 94, 50)
    }
  },
  water({ set, mix, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const w = Math.sin(x * 0.7 + y * 0.5) * 12
        set(x, y, mix(42, 10) + w, mix(108, 14) + w, mix(196, 12), 205)
      }
  },
  bedrock({ set, rng }) {
    speckleBase(set, [60, 60, 62], 14, rng)
    lumps(set, 6, [34, 34, 36], rng, 2.0)
    lumps(set, 4, [92, 92, 96], rng, 1.4)
  },
  glass({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) set(x, y, 210, 235, 245, 0)
    for (let i = 0; i < TILE_SIZE; i++) {
      const j = 210 + rng() * 30
      set(i, 0, j, 235, 245, 210)
      set(i, TILE_SIZE - 1, j, 235, 245, 210)
      set(0, i, j, 235, 245, 210)
      set(TILE_SIZE - 1, i, j, 235, 245, 210)
    }
    for (let i = 2; i < 7; i++) set(i, i + 2, 255, 255, 255, 150)
  },
  gravel({ set, rng }) {
    speckleBase(set, [126, 120, 114], 16, rng)
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rng() * TILE_SIZE), y = Math.floor(rng() * TILE_SIZE)
      const s = 92 + rng() * 90
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) set(x + dx, y + dy, s, s * 0.96, s * 0.92)
    }
  },
  coal_ore({ set, rng }) {
    drawers.stone({ set, rng })
    lumps(set, 4, [30, 30, 32], rng, 1.8)
  },
  iron_ore({ set, rng }) {
    drawers.stone({ set, rng })
    lumps(set, 4, [196, 152, 122], rng, 1.7)
  },
  gold_ore({ set, rng }) {
    drawers.stone({ set, rng })
    lumps(set, 4, [242, 210, 92], rng, 1.6)
  },
  diamond_ore({ set, rng }) {
    drawers.stone({ set, rng })
    lumps(set, 4, [116, 232, 232], rng, 1.6)
  },
  brick({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const row = Math.floor(y / 4)
        const mortarRow = y % 4 === 3
        const offset = row % 2 === 0 ? 0 : 4
        const mortarCol = (x + offset) % 8 === 7
        if (mortarRow || mortarCol) set(x, y, 168, 160, 150)
        else {
          const t = 0.9 + rng() * 0.2
          set(x, y, 158 * t, 74 * t, 58 * t)
        }
      }
  },
  mossy_cobble({ set, rng }) {
    drawers.cobble({ set, rng })
    lumps(set, 8, [70, 110, 58], rng, 1.6)
  },
  obsidian({ set, rng }) {
    speckleBase(set, [26, 18, 42], 8, rng)
    lumps(set, 5, [58, 40, 88], rng, 1.2)
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rng() * TILE_SIZE), y = Math.floor(rng() * TILE_SIZE)
      set(x, y, 120, 96, 180)
    }
  },
  cactus_side({ set, rng }) {
    speckleBase(set, [58, 118, 52], 10, rng)
    for (let x = 2; x < TILE_SIZE; x += 5) {
      for (let y = 0; y < TILE_SIZE; y++) set(x, y, 40, 92, 40)
    }
    for (let i = 0; i < 10; i++) set(Math.floor(rng() * TILE_SIZE), Math.floor(rng() * TILE_SIZE), 220, 230, 180)
  },
  cactus_top({ set, rng }) {
    speckleBase(set, [64, 128, 56], 8, rng)
    lumps(set, 5, [44, 96, 40], rng, 2.2)
  },
  crafting_top({ set, rng }) {
    for (let y = 0; y < TILE_SIZE; y++)
      for (let x = 0; x < TILE_SIZE; x++) {
        const g = (rng() * 2 - 1) * 6
        set(x, y, 168 + g, 126 + g, 70 + g)
      }
    for (let i = 0; i <= TILE_SIZE - 1; i += 5) {
      for (let j = 0; j < TILE_SIZE; j++) { set(i, j, 108, 78, 40); set(j, i, 108, 78, 40) }
    }
  },
  crafting_side({ set, rng }) {
    drawers.planks({ set, rng })
    for (let y = 5; y < 12; y++) for (let x = 3; x < 8; x++) set(x, y, 90, 62, 34)
    for (let y = 6; y < 11; y++) for (let x = 10; x < 14; x++) set(x, y, 150, 110, 60)
  }
}

let atlasCache = null

export function buildAtlas() {
  if (atlasCache) return atlasCache
  const tiles = {}
  for (const name of TILES) {
    const fn = drawers[name] || (({ set, mix }) => {
      for (let y = 0; y < TILE_SIZE; y++)
        for (let x = 0; x < TILE_SIZE; x++) set(x, y, mix(128, 20), mix(128, 20), mix(128, 20))
    })
    tiles[name] = paint(name, fn)
  }

  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_COLS * TILE_SIZE
  canvas.height = ATLAS_ROWS * TILE_SIZE
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = false
  TILES.forEach((name, i) => {
    const col = i % ATLAS_COLS
    const row = Math.floor(i / ATLAS_COLS)
    ctx.drawImage(tiles[name], col * TILE_SIZE, row * TILE_SIZE)
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapNearestFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true

  atlasCache = { canvas, texture, tiles, cols: ATLAS_COLS, rows: ATLAS_ROWS, tileSize: TILE_SIZE }
  return atlasCache
}

// Renders an isometric cube icon for HUD/palette. Returns a canvas.
export function renderBlockIcon(blockId, size = 96) {
  const atlas = buildAtlas()
  const def = BLOCKS[blockId]
  const out = makeTileCanvas(size)
  const ctx = out.getContext('2d')
  if (!def || def.air) return out
  ctx.imageSmoothingEnabled = false

  const W = size
  const Hs = W / 2
  const topTile = atlas.tiles[TILES[def.tiles[2]]]
  const sideTile = atlas.tiles[TILES[def.tiles[0]]]

  const face = (tile, O, U, V, shade, comp) => {
    ctx.save()
    ctx.setTransform(U[0] / TILE_SIZE, U[1] / TILE_SIZE, V[0] / TILE_SIZE, V[1] / TILE_SIZE, O[0], O[1])
    ctx.drawImage(tile, 0, 0)
    ctx.globalCompositeOperation = comp
    ctx.fillStyle = `rgba(${shade},${shade},${shade},1)`
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE)
    ctx.restore()
  }

  // left + right sides, then top
  face(sideTile, [0, W / 4], [W / 2, W / 4], [0, Hs], 170, 'multiply')
  face(sideTile, [W / 2, W / 2], [W / 2, -W / 4], [0, Hs], 120, 'multiply')
  face(topTile, [W / 2, 0], [W / 2, W / 4], [-W / 2, W / 4], 255, 'multiply')
  return out
}

// UV rect for a tile index, with a half-texel inset to avoid bleeding.
export function tileUV(atlas, tileIndex) {
  const col = tileIndex % atlas.cols
  const row = Math.floor(tileIndex / atlas.cols)
  const du = 1 / atlas.cols
  const dv = 1 / atlas.rows
  const padU = 0.5 / (atlas.cols * atlas.tileSize)
  const padV = 0.5 / (atlas.rows * atlas.tileSize)
  return {
    u0: col * du + padU,
    u1: (col + 1) * du - padU,
    v0: 1 - (row + 1) * dv + padV,
    v1: 1 - row * dv - padV
  }
}
