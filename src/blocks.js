// Block + texture-tile registry. Texture tiles are procedural (see textures.js).

export const TILES = [
  'grass_top', 'grass_side', 'snow_side', 'dirt', 'stone', 'cobble',
  'sand', 'sandstone_top', 'sandstone_side', 'log_side', 'log_top', 'leaves',
  'spruce_leaves', 'planks', 'water', 'bedrock', 'glass', 'gravel',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'brick', 'mossy_cobble',
  'obsidian', 'cactus_side', 'cactus_top', 'snow', 'crafting_top', 'crafting_side'
]

export const TILE = Object.fromEntries(TILES.map((n, i) => [n, i]))

// Tile index + face flags: opaque (occludes neighbours), solid (collides/liquid excluded)
export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  SANDSTONE: 6,
  LOG: 7,
  LEAVES: 8,
  PLANKS: 9,
  WATER: 10,
  BEDROCK: 11,
  GLASS: 12,
  SNOW: 13,
  GRAVEL: 14,
  COAL_ORE: 15,
  IRON_ORE: 16,
  GOLD_ORE: 17,
  DIAMOND_ORE: 18,
  SPRUCE_LOG: 19,
  SPRUCE_LEAVES: 20,
  CACTUS: 21,
  BRICK: 22,
  MOSSY_COBBLE: 23,
  OBSIDIAN: 24,
  CRAFTING: 25
}

// face order: +X, -X, +Y (top), -Y (bottom), +Z, -Z
const f = (top, side, bottom = side) => [side, side, top, bottom, side, side]

export const BLOCKS = {
  0: { name: 'Air', air: true },
  1: { name: 'Grass', tiles: f(TILE.grass_top, TILE.grass_side, TILE.dirt), opaque: true, solid: true, tint: 'grass', sound: 'grass' },
  2: { name: 'Dirt', tiles: f(TILE.dirt, TILE.dirt), opaque: true, solid: true, sound: 'grass' },
  3: { name: 'Stone', tiles: f(TILE.stone, TILE.stone), opaque: true, solid: true, sound: 'stone' },
  4: { name: 'Cobblestone', tiles: f(TILE.cobble, TILE.cobble), opaque: true, solid: true, sound: 'stone' },
  5: { name: 'Sand', tiles: f(TILE.sand, TILE.sand), opaque: true, solid: true, sound: 'sand' },
  6: { name: 'Sandstone', tiles: f(TILE.sandstone_top, TILE.sandstone_side), opaque: true, solid: true, sound: 'stone' },
  7: { name: 'Oak Log', tiles: f(TILE.log_top, TILE.log_side, TILE.log_top), opaque: true, solid: true, sound: 'wood' },
  8: { name: 'Leaves', tiles: f(TILE.leaves, TILE.leaves), opaque: false, cutout: true, solid: true, tint: 'foliage', sound: 'grass' },
  9: { name: 'Planks', tiles: f(TILE.planks, TILE.planks), opaque: true, solid: true, sound: 'wood' },
  10: { name: 'Water', tiles: f(TILE.water, TILE.water), liquid: true, transparent: true, solid: false, sound: 'water' },
  11: { name: 'Bedrock', tiles: f(TILE.bedrock, TILE.bedrock), opaque: true, solid: true, sound: 'stone' },
  12: { name: 'Glass', tiles: f(TILE.glass, TILE.glass), opaque: false, cutout: true, solid: true, sound: 'stone' },
  13: { name: 'Snow', tiles: f(TILE.snow, TILE.snow_side, TILE.dirt), opaque: true, solid: true, sound: 'snow' },
  14: { name: 'Gravel', tiles: f(TILE.gravel, TILE.gravel), opaque: true, solid: true, sound: 'sand' },
  15: { name: 'Coal Ore', tiles: f(TILE.coal_ore, TILE.coal_ore), opaque: true, solid: true, sound: 'stone' },
  16: { name: 'Iron Ore', tiles: f(TILE.iron_ore, TILE.iron_ore), opaque: true, solid: true, sound: 'stone' },
  17: { name: 'Gold Ore', tiles: f(TILE.gold_ore, TILE.gold_ore), opaque: true, solid: true, sound: 'stone' },
  18: { name: 'Diamond Ore', tiles: f(TILE.diamond_ore, TILE.diamond_ore), opaque: true, solid: true, sound: 'stone' },
  19: { name: 'Spruce Log', tiles: f(TILE.log_top, TILE.log_side, TILE.log_top), opaque: true, solid: true, sound: 'wood' },
  20: { name: 'Spruce Leaves', tiles: f(TILE.spruce_leaves, TILE.spruce_leaves), opaque: false, cutout: true, solid: true, tint: 'foliage', sound: 'grass' },
  21: { name: 'Cactus', tiles: f(TILE.cactus_top, TILE.cactus_side), opaque: true, solid: true, sound: 'grass' },
  22: { name: 'Bricks', tiles: f(TILE.brick, TILE.brick), opaque: true, solid: true, sound: 'stone' },
  23: { name: 'Mossy Cobble', tiles: f(TILE.mossy_cobble, TILE.mossy_cobble), opaque: true, solid: true, sound: 'stone' },
  24: { name: 'Obsidian', tiles: f(TILE.obsidian, TILE.obsidian), opaque: true, solid: true, sound: 'stone' },
  25: { name: 'Crafting Table', tiles: f(TILE.crafting_top, TILE.crafting_side), opaque: true, solid: true, sound: 'wood' }
}

export function blockDef(id) {
  return BLOCKS[id] || BLOCKS[0]
}

export function isOpaque(id) {
  return !!(BLOCKS[id] && BLOCKS[id].opaque)
}
export function isSolid(id) {
  return !!(BLOCKS[id] && BLOCKS[id].solid)
}
export function isLiquid(id) {
  return !!(BLOCKS[id] && BLOCKS[id].liquid)
}
export function isAir(id) {
  return id === 0
}

// Hotbar / palette selection (block ids the player can build with).
export const PLACEABLE = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.SAND,
  BLOCK.SANDSTONE, BLOCK.LOG, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.GLASS,
  BLOCK.SNOW, BLOCK.GRAVEL, BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE,
  BLOCK.DIAMOND_ORE, BLOCK.SPRUCE_LOG, BLOCK.SPRUCE_LEAVES, BLOCK.CACTUS,
  BLOCK.BRICK, BLOCK.MOSSY_COBBLE, BLOCK.OBSIDIAN, BLOCK.CRAFTING, BLOCK.BEDROCK
]
