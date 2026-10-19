export const CHUNK_SIZE = 16
export const WORLD_HEIGHT = 80
export const SEA_LEVEL = 30
export const MAX_LIGHT = 15

export const voxelIndex = (x, y, z) => x + CHUNK_SIZE * (z + CHUNK_SIZE * y)

export const chunkKey = (cx, cz) => `${cx},${cz}`

export const BIOME_NAMES = ['plains', 'forest', 'desert', 'snowy']
export const BIOME_ID = { plains: 0, forest: 1, desert: 2, snowy: 3 }

// Biome tint multipliers (around 1.0) applied to grass/foliage top faces.
export const BIOME_TINT = {
  plains: { grass: [1.0, 1.02, 0.92], foliage: [0.98, 1.02, 0.95] },
  forest: { grass: [0.78, 1.0, 0.72], foliage: [0.68, 0.95, 0.62] },
  desert: { grass: [1.0, 0.98, 0.85], foliage: [1.0, 0.96, 0.8] },
  snowy: { grass: [0.88, 0.96, 1.05], foliage: [0.8, 0.98, 1.0] }
}
