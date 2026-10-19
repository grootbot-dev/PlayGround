import * as THREE from 'three'
import { BLOCKS, isOpaque } from './blocks.js'
import { CHUNK_SIZE, WORLD_HEIGHT, BIOME_NAMES, BIOME_TINT, voxelIndex } from './constants.js'
import { tileUV, buildAtlas } from './textures.js'

// face order: +X, -X, +Y, -Y, +Z, -Z  (matches BLOCKS tiles order)
const FACES = [
  { n: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.74 },
  { n: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.74 },
  { n: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.86 },
  { n: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.86 }
]
const CUV = [[0, 0], [0, 1], [1, 1], [1, 0]]
const AO_LEVELS = [0.42, 0.62, 0.8, 1.0]

function aoFactor(s1, s2, c) {
  if (s1 && s2) return AO_LEVELS[0]
  return AO_LEVELS[3 - (s1 + s2 + c)]
}

export class Chunk {
  constructor(cx, cz, voxels, biomes, maxY = WORLD_HEIGHT - 1) {
    this.cx = cx
    this.cz = cz
    this.voxels = voxels
    this.biomes = biomes
    this.maxY = maxY
    this.meshes = {}
    this.dirty = true
  }

  dispose() {
    for (const key of Object.keys(this.meshes)) {
      const mesh = this.meshes[key]
      if (mesh) {
        mesh.geometry.dispose()
        mesh.parent?.remove(mesh)
      }
    }
    this.meshes = {}
  }
}

function toGeometry(buf) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf.pos), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf.nor), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(buf.uv), 2))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(buf.col), 3))
  g.computeBoundingSphere()
  return g
}

export function buildChunkGeometry(chunk, world) {
  const atlas = buildAtlas()
  const { cx, cz, voxels, biomes } = chunk
  const topY = Math.min(WORLD_HEIGHT - 1, chunk.maxY + 1)

  const group = {
    opaque: { pos: [], nor: [], uv: [], col: [] },
    cutout: { pos: [], nor: [], uv: [], col: [] },
    water: { pos: [], nor: [], uv: [], col: [] }
  }

  const neighbourCache = new Map()
  const neighbour = (ox, oz) => {
    if (ox === 0 && oz === 0) return voxels
    const key = `${cx + ox},${cz + oz}`
    if (neighbourCache.has(key)) return neighbourCache.get(key)
    const c = world.getChunk(cx + ox, cz + oz)
    const v = c ? c.voxels : null
    neighbourCache.set(key, v)
    return v
  }

  const sample = (lx, ly, lz) => {
    if (ly < 0 || ly >= WORLD_HEIGHT) return 0
    let ox = 0, oz = 0, x = lx, z = lz
    if (lx < 0) { ox = -1; x = lx + CHUNK_SIZE } else if (lx >= CHUNK_SIZE) { ox = 1; x = lx - CHUNK_SIZE }
    if (lz < 0) { oz = -1; z = lz + CHUNK_SIZE } else if (lz >= CHUNK_SIZE) { oz = 1; z = lz - CHUNK_SIZE }
    const arr = neighbour(ox, oz)
    if (!arr) return 0
    return arr[voxelIndex(x, ly, z)]
  }

  const occluded = (lx, ly, lz) => isOpaque(sample(lx, ly, lz))

  for (let ly = 0; ly <= topY; ly++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const id = voxels[voxelIndex(lx, ly, lz)]
        if (id === 0) continue
        const def = BLOCKS[id]
        if (!def) continue

        const target = def.liquid ? group.water : def.cutout ? group.cutout : group.opaque
        const biomeTint = def.tint ? BIOME_TINT[BIOME_NAMES[biomes[lx + CHUNK_SIZE * lz]]] : null

        for (let fi = 0; fi < 6; fi++) {
          const face = FACES[fi]
          const nb = sample(lx + face.n[0], ly + face.n[1], lz + face.n[2])
          const nbDef = BLOCKS[nb] || BLOCKS[0]

          let visible
          if (def.liquid) visible = nb === 0
          else if (def.opaque) visible = !nbDef.opaque
          else visible = !nbDef.opaque && nb !== id
          if (!visible) continue

          const uv = tileUV(atlas, def.tiles[fi])

          let tint = [1, 1, 1]
          if (biomeTint) {
            if (def.tint === 'grass' && face.n[1] !== 1) tint = [1, 1, 1]
            else tint = def.tint === 'grass' ? biomeTint.grass : biomeTint.foliage
          }

          let baseShade = face.shade
          if (def.opaque && def.tint === 'grass' && face.n[1] === 1) baseShade = 1.0

          const verts = []
          for (let vi = 0; vi < 4; vi++) {
            const corner = face.corners[vi]
            const px = lx + corner[0]
            const py = ly + corner[1]
            const pz = lz + corner[2]

            let ao = 1
            if (!def.liquid) {
              const bx = lx + face.n[0]
              const by = ly + face.n[1]
              const bz = lz + face.n[2]
              const axes = [0, 1, 2].filter((a) => face.n[a] === 0)
              const uA = axes[0]
              const vA = axes[1]
              const du = corner[uA] * 2 - 1
              const dv = corner[vA] * 2 - 1
              const o1 = [bx, by, bz]; o1[uA] += du
              const o2 = [bx, by, bz]; o2[vA] += dv
              const o3 = [bx, by, bz]; o3[uA] += du; o3[vA] += dv
              ao = aoFactor(occluded(o1[0], o1[1], o1[2]), occluded(o2[0], o2[1], o2[2]), occluded(o3[0], o3[1], o3[2]))
            }

            const light = baseShade * ao
            verts.push({
              p: [px, py, pz],
              t: [uv.u0 + CUV[vi][0] * (uv.u1 - uv.u0), uv.v0 + CUV[vi][1] * (uv.v1 - uv.v0)],
              c: [light * tint[0], light * tint[1], light * tint[2]]
            })
          }

          const order = [0, 1, 2, 0, 2, 3]
          for (const oi of order) {
            const v = verts[oi]
            target.pos.push(v.p[0], v.p[1], v.p[2])
            target.nor.push(face.n[0], face.n[1], face.n[2])
            target.uv.push(v.t[0], v.t[1])
            target.col.push(v.c[0], v.c[1], v.c[2])
          }
        }
      }
    }
  }

  const result = {}
  for (const key of ['opaque', 'cutout', 'water']) {
    const buf = group[key]
    result[key] = buf.pos.length ? toGeometry(buf) : null
  }
  return result
}
