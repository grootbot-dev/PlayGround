import { Noise, hash2 } from './noise.js'
import { BLOCK } from './blocks.js'
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, voxelIndex, BIOME_ID } from './constants.js'

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export class WorldGen {
  constructor(seed = 20250915) {
    this.seed = seed
    this.continent = new Noise(seed + 11)
    this.rolling = new Noise(seed + 22)
    this.detail = new Noise(seed + 33)
    this.temperature = new Noise(seed + 44)
    this.humidity = new Noise(seed + 55)
    this.caveA = new Noise(seed + 66)
    this.caveB = new Noise(seed + 77)
  }

  columnInfo(wx, wz) {
    const c = this.continent.fbm2(wx * 0.0012, wz * 0.0012, 4)
    const land = smoothstep(-0.22, 0.3, c)
    const mountain = Math.pow(smoothstep(0.18, 0.72, c), 1.6)
    const roll = this.rolling.fbm2(wx * 0.0085, wz * 0.0085, 4)
    const detail = this.detail.fbm2(wx * 0.045, wz * 0.045, 3)

    let height = 15 + land * 15 + mountain * 34 + roll * (1.5 + land * 6) + detail * 1.4

    const temp = this.temperature.fbm2(wx * 0.0016, wz * 0.0016, 3)
    const hum = this.humidity.fbm2(wx * 0.0019 + 400, wz * 0.0019 + 400, 3)

    let biome = 'plains'
    if (temp > 0.3 && hum < 0.0) biome = 'desert'
    else if (temp < -0.3) biome = 'snowy'
    else if (hum > 0.16) biome = 'forest'

    if (mountain > 0.35 && height > 52) biome = temp < -0.15 ? 'snowy' : 'plains'

    height = Math.max(2, Math.min(WORLD_HEIGHT - 6, height))
    return { height, biome, mountain }
  }

  caveAt(wx, y, wz) {
    const a = this.caveA.noise3(wx * 0.055, y * 0.085, wz * 0.055)
    if (Math.abs(a) < 0.065) return true
    if (y < 42) {
      const b = this.caveB.noise3(wx * 0.03, y * 0.05, wz * 0.03)
      if (Math.abs(b) < 0.045) return true
    }
    return false
  }

  oreAt(wx, y, wz) {
    const r = hash2(wx * 7 + y * 13, wz * 7 - y * 5, this.seed)
    if (y < 16 && r < 0.0035) return BLOCK.DIAMOND_ORE
    if (y < 28 && r < 0.008) return BLOCK.GOLD_ORE
    if (y < 40 && r < 0.018) return BLOCK.IRON_ORE
    if (y < 52 && r < 0.032) return BLOCK.COAL_ORE
    return 0
  }

  generateChunk(cx, cz) {
    const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT)
    const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
    const baseX = cx * CHUNK_SIZE
    const baseZ = cz * CHUNK_SIZE

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = baseX + lx
        const wz = baseZ + lz
        const { height, biome } = this.columnInfo(wx, wz)
        biomes[lx + CHUNK_SIZE * lz] = BIOME_ID[biome]
        const surface = Math.max(1, Math.round(height))
        const underwater = surface < SEA_LEVEL

        for (let y = 0; y <= surface; y++) {
          let id
          if (y <= 1) id = BLOCK.BEDROCK
          else if (y === surface) {
            if (biome === 'desert') id = BLOCK.SAND
            else if (biome === 'snowy' || surface > 58) id = BLOCK.SNOW
            else if (underwater) id = BLOCK.SAND
            else if (surface <= SEA_LEVEL + 1 && surface >= SEA_LEVEL - 1) id = BLOCK.SAND
            else id = BLOCK.GRASS
          } else if (y > surface - 4) {
            id = biome === 'desert' ? BLOCK.SAND : underwater ? BLOCK.SAND : BLOCK.DIRT
          } else {
            id = BLOCK.STONE
          }

          if (id === BLOCK.BEDROCK && y === 1 && hash2(wx, wz, this.seed + 9) < 0.5) id = BLOCK.STONE
          if (id === BLOCK.STONE || id === BLOCK.DIRT) {
            if (y > 2 && this.caveAt(wx, y, wz)) continue
            if (id === BLOCK.STONE) {
              const ore = this.oreAt(wx, y, wz)
              if (ore) id = ore
              else if (y < 42 && hash2(wx * 3 + y, wz - y, this.seed + 5) < 0.012) id = BLOCK.GRAVEL
            }
          }
          voxels[voxelIndex(lx, y, lz)] = id
        }

        // Water fills above the surface up to sea level.
        for (let y = surface + 1; y <= SEA_LEVEL; y++) {
          voxels[voxelIndex(lx, y, lz)] = BLOCK.WATER
        }
      }
    }

    this.scatterTrees(voxels, cx, cz)

    // Highest non-air level, so the mesher can skip empty space.
    let maxY = 0
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      let found = false
      for (let lz = 0; lz < CHUNK_SIZE && !found; lz++)
        for (let lx = 0; lx < CHUNK_SIZE; lx++)
          if (voxels[voxelIndex(lx, y, lz)]) { found = true; break }
      if (found) { maxY = y; break }
    }

    return { voxels, biomes, maxY }
  }

  scatterTrees(voxels, cx, cz) {
    const margin = 3
    const baseX = cx * CHUNK_SIZE
    const baseZ = cz * CHUNK_SIZE

    for (let wx = baseX - margin; wx < baseX + CHUNK_SIZE + margin; wx++) {
      for (let wz = baseZ - margin; wz < baseZ + CHUNK_SIZE + margin; wz++) {
        const chance = hash2(wx, wz, this.seed + 101)
        const gate = hash2(wx, wz, this.seed + 202)
        const { height, biome } = this.columnInfo(wx, wz)
        const surface = Math.round(height)
        if (surface <= SEA_LEVEL) continue

        let density = 0
        if (biome === 'forest') density = 0.045
        else if (biome === 'snowy') density = 0.028
        else if (biome === 'plains') density = 0.007
        if (chance > density || gate > density * 60) continue

        const type = biome === 'desert' ? 'cactus' : biome === 'snowy' ? 'spruce' : 'oak'
        this.plantTree(voxels, wx, surface, wz, type, baseX, baseZ)
      }
    }
  }

  setLocal(voxels, wx, y, wz, id, baseX, baseZ, overwrite = true) {
    const lx = wx - baseX
    const lz = wz - baseZ
    if (lx < 0 || lz < 0 || lx >= CHUNK_SIZE || lz >= CHUNK_SIZE) return
    if (y < 0 || y >= WORLD_HEIGHT) return
    const i = voxelIndex(lx, y, lz)
    if (!overwrite && voxels[i] !== BLOCK.AIR && voxels[i] !== BLOCK.WATER) return
    voxels[i] = id
  }

  plantTree(voxels, wx, surface, wz, type, baseX, baseZ) {
    if (type === 'cactus') {
      const h = 2 + Math.floor(hash2(wx, wz, this.seed + 3) * 2)
      for (let i = 0; i < h; i++) this.setLocal(voxels, wx, surface + 1 + i, wz, BLOCK.CACTUS, baseX, baseZ)
      return
    }
    if (type === 'spruce') {
      const h = 6 + Math.floor(hash2(wx, wz, this.seed + 4) * 4)
      const top = surface + h
      for (let y = surface + 1; y <= top; y++) this.setLocal(voxels, wx, y, wz, BLOCK.SPRUCE_LOG, baseX, baseZ)
      let radius = 0
      for (let y = top; y >= surface + 2; y--) {
        const step = (top - y) % 3
        radius = y > top - 2 ? 0 : step === 0 ? 2 : 1
        for (let dx = -radius; dx <= radius; dx++)
          for (let dz = -radius; dz <= radius; dz++) {
            if (Math.abs(dx) === radius && Math.abs(dz) === radius && radius > 0) continue
            this.setLocal(voxels, wx + dx, y, wz + dz, BLOCK.SPRUCE_LEAVES, baseX, baseZ, false)
          }
      }
      this.setLocal(voxels, wx, top + 1, wz, BLOCK.SPRUCE_LEAVES, baseX, baseZ, false)
      return
    }
    // oak
    const h = 4 + Math.floor(hash2(wx, wz, this.seed + 6) * 3)
    const top = surface + h
    for (let y = surface + 1; y <= top; y++) this.setLocal(voxels, wx, y, wz, BLOCK.LOG, baseX, baseZ)
    const leafBase = top - 2
    for (let y = leafBase; y <= top + 1; y++) {
      const r = y >= top ? 1 : 2
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && y <= top) continue
          if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2 && hash2(wx + dx, wz + dz, y) < 0.5) continue
          this.setLocal(voxels, wx + dx, y, wz + dz, BLOCK.LEAVES, baseX, baseZ, false)
        }
    }
  }
}
