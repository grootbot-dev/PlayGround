import * as THREE from 'three'
import { Chunk, buildChunkGeometry } from './chunk.js'
import { WorldGen } from './generation.js'
import { CHUNK_SIZE, WORLD_HEIGHT, SEA_LEVEL, voxelIndex } from './constants.js'
import { isLiquid, isSolid, isOpaque } from './blocks.js'
import { buildAtlas } from './textures.js'

export class World {
  constructor(scene, seed = 20250915, renderDistance = 7) {
    this.scene = scene
    this.gen = new WorldGen(seed)
    this.renderDistance = renderDistance
    this.chunks = new Map()
    this.pending = []
    this.pendingSet = new Set()
    this.group = new THREE.Group()
    this.group.name = 'world'
    scene.add(this.group)

    const atlas = buildAtlas()
    this.atlas = atlas
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      water: new THREE.MeshLambertMaterial({
        map: atlas.texture, vertexColors: true, transparent: true,
        opacity: 0.74, depthWrite: false, side: THREE.DoubleSide
      })
    }
  }

  key(cx, cz) { return `${cx},${cz}` }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)) }

  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return 0
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cz = Math.floor(wz / CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return 0
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    return chunk.voxels[voxelIndex(lx, wy, lz)]
  }

  isSolidAt(wx, wy, wz) { return isSolid(this.getBlock(wx, wy, wz)) }
  isOpaqueAt(wx, wy, wz) { return isOpaque(this.getBlock(wx, wy, wz)) }
  isLiquidAt(wx, wy, wz) { return isLiquid(this.getBlock(wx, wy, wz)) }

  setBlock(wx, wy, wz, id) {
    if (wy < 0 || wy >= WORLD_HEIGHT) return false
    const cx = Math.floor(wx / CHUNK_SIZE)
    const cz = Math.floor(wz / CHUNK_SIZE)
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return false
    const lx = wx - cx * CHUNK_SIZE
    const lz = wz - cz * CHUNK_SIZE
    chunk.voxels[voxelIndex(lx, wy, lz)] = id
    if (id !== 0 && wy > chunk.maxY) chunk.maxY = wy
    chunk.dirty = true
    if (lx === 0 || lx === CHUNK_SIZE - 1 || lz === 0 || lz === CHUNK_SIZE - 1) {
      for (let ox = -1; ox <= 1; ox++)
        for (let oz = -1; oz <= 1; oz++) {
          const n = this.getChunk(cx + ox, cz + oz)
          if (n) n.dirty = true
        }
    }
    return true
  }

  buildMesh(chunk) {
    const geoms = buildChunkGeometry(chunk, this)
    for (const key of ['opaque', 'cutout', 'water']) {
      const existing = chunk.meshes[key]
      if (existing) {
        existing.geometry.dispose()
        this.group.remove(existing)
        // keep the object out of the way; replaced below if needed
      }
      chunk.meshes[key] = null
      if (geoms[key]) {
        const mesh = new THREE.Mesh(geoms[key], this.materials[key])
        mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE)
        if (key === 'water') mesh.renderOrder = 2
        if (key === 'cutout') { mesh.renderOrder = 1; mesh.receiveShadow = true }
        if (key === 'opaque') { mesh.castShadow = true; mesh.receiveShadow = true }
        mesh.frustumCulled = true
        chunk.meshes[key] = mesh
        this.group.add(mesh)
      }
    }
    chunk.dirty = false
  }

  addChunk(cx, cz) {
    if (this.getChunk(cx, cz)) return this.getChunk(cx, cz)
    const { voxels, biomes, maxY } = this.gen.generateChunk(cx, cz)
    const chunk = new Chunk(cx, cz, voxels, biomes, maxY)
    this.chunks.set(this.key(cx, cz), chunk)
    this.buildMesh(chunk)
    // Neighbours may have skipped border faces while this chunk was missing.
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        if (ox === 0 && oz === 0) continue
        const n = this.getChunk(cx + ox, cz + oz)
        if (n) n.dirty = true
      }
    return chunk
  }

  removeChunk(cx, cz) {
    const chunk = this.getChunk(cx, cz)
    if (!chunk) return
    chunk.dispose()
    this.chunks.delete(this.key(cx, cz))
  }

  scheduleAround(px, pz) {
    const pcx = Math.floor(px / CHUNK_SIZE)
    const pcz = Math.floor(pz / CHUNK_SIZE)
    const R = this.renderDistance
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        if (dx * dx + dz * dz > R * R + R) continue
        const cx = pcx + dx
        const cz = pcz + dz
        if (this.getChunk(cx, cz) || this.pendingSet.has(this.key(cx, cz))) continue
        this.pending.push({ cx, cz, d: dx * dx + dz * dz })
        this.pendingSet.add(this.key(cx, cz))
      }
    }
    // unload far chunks
    const limit = (R + 2) * (R + 2)
    for (const [k, chunk] of this.chunks) {
      const dx = chunk.cx - pcx
      const dz = chunk.cz - pcz
      if (dx * dx + dz * dz > limit) {
        chunk.dispose()
        this.chunks.delete(k)
      }
    }
  }

  // Generates/rebuilds work within a time budget. Returns number of jobs done.
  update(px, pz, budgetMs = 6) {
    this.scheduleAround(px, pz)
    const start = performance.now()
    let jobs = 0

    if (this.pending.length) {
      this.pending.sort((a, b) => a.d - b.d)
      while (this.pending.length && performance.now() - start < budgetMs) {
        const job = this.pending.shift()
        this.pendingSet.delete(this.key(job.cx, job.cz))
        this.addChunk(job.cx, job.cz)
        jobs++
      }
    }

    for (const chunk of this.chunks.values()) {
      if (performance.now() - start > budgetMs) break
      if (chunk.dirty) { this.buildMesh(chunk); jobs++ }
    }
    return jobs
  }

  // Synchronous warm-up used at spawn.
  preload(px, pz, radius = 4) {
    const pcx = Math.floor(px / CHUNK_SIZE)
    const pcz = Math.floor(pz / CHUNK_SIZE)
    for (let dx = -radius; dx <= radius; dx++)
      for (let dz = -radius; dz <= radius; dz++)
        this.addChunk(pcx + dx, pcz + dz)
    this.scheduleAround(px, pz)
    for (const chunk of this.chunks.values()) if (chunk.dirty) this.buildMesh(chunk)
  }

  findSpawn() {
    for (let r = 0; r < 64; r++) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2
        const x = Math.round(Math.cos(ang) * r * 5)
        const z = Math.round(Math.sin(ang) * r * 5)
        const { height, biome } = this.gen.columnInfo(x, z)
        const h = Math.round(height)
        if (h > SEA_LEVEL + 1 && biome !== 'snowy') return new THREE.Vector3(x + 0.5, h + 2.2, z + 0.5)
      }
    }
    return new THREE.Vector3(0.5, SEA_LEVEL + 8, 0.5)
  }

  raycast(origin, direction, maxDistance = 6) {
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)
    const stepX = direction.x > 0 ? 1 : -1
    const stepY = direction.y > 0 ? 1 : -1
    const stepZ = direction.z > 0 ? 1 : -1
    const invX = Math.abs(1 / direction.x)
    const invY = Math.abs(1 / direction.y)
    const invZ = Math.abs(1 / direction.z)
    const tDeltaX = Number.isFinite(invX) ? invX : Infinity
    const tDeltaY = Number.isFinite(invY) ? invY : Infinity
    const tDeltaZ = Number.isFinite(invZ) ? invZ : Infinity
    const distToBoundary = (o, cell, step) => step > 0 ? (cell + 1 - o) : (o - cell)
    let tMaxX = tDeltaX === Infinity ? Infinity : distToBoundary(origin.x, x, stepX) * tDeltaX
    let tMaxY = tDeltaY === Infinity ? Infinity : distToBoundary(origin.y, y, stepY) * tDeltaY
    let tMaxZ = tDeltaZ === Infinity ? Infinity : distToBoundary(origin.z, z, stepZ) * tDeltaZ

    let nx = 0, ny = 0, nz = 0
    let guard = 0
    while (guard++ < 512 && Math.min(tMaxX, tMaxY, tMaxZ) <= maxDistance) {
      const b = this.getBlock(x, y, z)
      if (b !== 0 && !isLiquid(b)) return { x, y, z, nx, ny, nz }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0
      } else if (tMaxY < tMaxZ) {
        y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0
      } else {
        z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ
      }
    }
    const b0 = this.getBlock(Math.floor(origin.x), Math.floor(origin.y), Math.floor(origin.z))
    if (b0 !== 0 && !isLiquid(b0)) return { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z), nx: 0, ny: 1, nz: 0 }
    return null
  }
}
