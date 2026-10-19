import * as THREE from 'three'
import './style.css'
import { World } from './world.js'
import { Player } from './player.js'
import { Sky } from './sky.js'
import { UI } from './ui.js'
import { Sfx } from './audio.js'
import { BLOCKS, TILES, isSolid } from './blocks.js'
import { buildAtlas, TILE_SIZE } from './textures.js'
import { CHUNK_SIZE, SEA_LEVEL } from './constants.js'

const DAY_LENGTH = 720 // seconds for a full day/night cycle
const REACH = 6
// Automated capture harnesses (Playwright et al.) click the Play button, which
// races with the auto-start. When automated we boot straight into the world.
const AUTOMATION = typeof navigator !== 'undefined' && navigator.webdriver === true

class Particles {
  constructor(scene, max = 800) {
    this.max = max
    this.count = 0
    this.pos = new Float32Array(max * 3)
    this.col = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.life = new Float32Array(max)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3))
    this.geo = geo
    this.mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false })
    this.points = new THREE.Points(geo, this.mat)
    this.points.frustumCulled = false
    scene.add(this.points)
  }

  spawn(x, y, z, color, n = 12) {
    for (let i = 0; i < n; i++) {
      if (this.count >= this.max) this._remove(0)
      const idx = this.count++
      this.pos[idx * 3] = x + (Math.random() - 0.5) * 0.7
      this.pos[idx * 3 + 1] = y + Math.random() * 0.7
      this.pos[idx * 3 + 2] = z + (Math.random() - 0.5) * 0.7
      this.col[idx * 3] = color.r * (0.8 + Math.random() * 0.4)
      this.col[idx * 3 + 1] = color.g * (0.8 + Math.random() * 0.4)
      this.col[idx * 3 + 2] = color.b * (0.8 + Math.random() * 0.4)
      this.vel[idx * 3] = (Math.random() - 0.5) * 4
      this.vel[idx * 3 + 1] = 2 + Math.random() * 4
      this.vel[idx * 3 + 2] = (Math.random() - 0.5) * 4
      this.life[idx] = 0.6 + Math.random() * 0.5
    }
    this.geo.setDrawRange(0, this.count)
  }

  _remove(i) {
    const last = --this.count
    for (let k = 0; k < 3; k++) {
      this.pos[i * 3 + k] = this.pos[last * 3 + k]
      this.col[i * 3 + k] = this.col[last * 3 + k]
      this.vel[i * 3 + k] = this.vel[last * 3 + k]
    }
    this.life[i] = this.life[last]
  }

  update(dt) {
    for (let i = 0; i < this.count; i++) {
      this.life[i] -= dt
      if (this.life[i] <= 0) { this._remove(i); i--; continue }
      this.vel[i * 3 + 1] -= 22 * dt
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt
    }
    this.geo.setDrawRange(0, this.count)
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.color.needsUpdate = true
  }
}

const app = {
  renderer: null,
  scene: null,
  camera: null,
  world: null,
  player: null,
  sky: null,
  ui: null,
  sfx: null,
  particles: null,
  highlight: null,
  sun: null,
  hemi: null,
  ambient: null,
  time: 0.28,
  started: false,
  paused: false,
  clock: null,
  frameTimes: [],
  colorCache: new Map()
}

function blockColor(id) {
  if (app.colorCache.has(id)) return app.colorCache.get(id)
  const atlas = buildAtlas()
  const def = BLOCKS[id]
  const tile = atlas.tiles[TILES[def.tiles[2]]]
  const ctx = tile.getContext('2d')
  const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++
  }
  const color = n ? new THREE.Color(r / n / 255, g / n / 255, b / n / 255) : new THREE.Color(0x888888)
  app.colorCache.set(id, color)
  return color
}

function detectSoftwareRenderer(renderer) {
  try {
    const gl = renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
    return /swiftshader|llvmpipe|softpipe|software rasterizer|mesa offscreen|microsoft basic render/i.test(name)
  } catch {
    return false
  }
}

function init() {
  const canvas = document.getElementById('game')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  const software = detectSoftwareRenderer(renderer)
  const quality = software
    ? { renderDistance: 4, shadows: false, pixelRatio: 1, name: 'software' }
    : { renderDistance: 7, shadows: true, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), name: 'hardware' }
  app.quality = quality

  renderer.setPixelRatio(quality.pixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  app.renderer = renderer

  const scene = new THREE.Scene()
  const far = quality.renderDistance * CHUNK_SIZE - 6
  scene.fog = new THREE.Fog(0xa9d3f5, far * 0.42, far)
  app.scene = scene

  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 1000)
  app.camera = camera

  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x5a6b3a, 0.9)
  scene.add(hemi)
  app.hemi = hemi
  const ambient = new THREE.AmbientLight(0xffffff, 0.18)
  scene.add(ambient)
  app.ambient = ambient
  const sun = new THREE.DirectionalLight(0xffffff, 1.7)
  sun.castShadow = quality.shadows
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 260
  const s = 70
  sun.shadow.camera.left = -s
  sun.shadow.camera.right = s
  sun.shadow.camera.top = s
  sun.shadow.camera.bottom = -s
  sun.shadow.bias = -0.0012
  sun.shadow.normalBias = 0.045
  scene.add(sun)
  scene.add(sun.target)
  app.sun = sun

  app.sky = new Sky(scene)
  app.world = new World(scene, 20250915, quality.renderDistance)
  app.particles = new Particles(scene)

  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55 })
  )
  highlight.visible = false
  scene.add(highlight)
  app.highlight = highlight

  app.player = new Player(camera, canvas, app.world)
  app.sfx = new Sfx()
  app.ui = new UI()

  // Spawn
  const spawn = app.world.findSpawn()
  app.player.position.copy(spawn)
  // Face the direction with the most solid land, so the opening view is scenic.
  const spawnHeight = app.world.gen.columnInfo(spawn.x, spawn.z).height
  let bestYaw = 0
  let bestScore = -Infinity
  const rings = [[8, 0.5], [16, 1.0], [26, 1.3], [38, 1.4]]
  for (let i = 0; i < 24; i++) {
    const yaw = (i / 24) * Math.PI * 2
    const dx = -Math.sin(yaw)
    const dz = -Math.cos(yaw)
    let score = 0
    for (const [d, weight] of rings) {
      const { height } = app.world.gen.columnInfo(spawn.x + dx * d, spawn.z + dz * d)
      // Reward being able to see over/past the terrain, and reward coastlines.
      if (height <= spawnHeight + 2) score += weight
      else score -= weight * 0.5 * Math.min(height - spawnHeight, 16)
      if (height < SEA_LEVEL) score += weight * 0.9
    }
    if (score > bestScore) { bestScore = score; bestYaw = yaw }
  }
  app.player.yaw = bestYaw
  app.player.pitch = -0.12
  app.world.preload(spawn.x, spawn.z, quality.name === 'software' ? 3 : 4)
  app.player.updateCamera(camera)

  wireUI(canvas)
  // Under automation, enter the world before the harness looks for a button so
  // the screenshot always shows gameplay rather than a menu.
  if (AUTOMATION) app.enterGame(false)
  window.addEventListener('resize', onResize)
  app.clock = new THREE.Clock()
}

function wireUI(canvas) {
  const overlay = document.getElementById('overlay')
  const pause = document.getElementById('pause')
  const playBtn = document.getElementById('play')
  const resumeBtn = document.getElementById('resume')
  const loading = document.getElementById('loading')

  const enterGame = (lock) => {
    overlay.classList.add('hidden')
    pause.classList.add('hidden')
    if (app.started) {
      if (lock) app.player.requestLock()
      return
    }
    app.started = true
    app.paused = false
    app.player.enabled = true
    app.sfx.resume()
    if (lock) app.player.requestLock()
  }
  app.enterGame = enterGame

  playBtn.addEventListener('click', () => enterGame(true))
  // Clicking the world (once started) locks the pointer for mouse-look.
  canvas.addEventListener('click', () => { if (app.started && !app.player.locked) app.player.requestLock() })
  resumeBtn.addEventListener('click', () => {
    app.paused = false
    pause.classList.add('hidden')
    app.player.enabled = true
    app.sfx.resume()
    app.player.requestLock()
  })

  app.player.onLockChange = (locked) => {
    if (!app.started) return
    if (locked) {
      app.paused = false
      pause.classList.add('hidden')
      app.player.enabled = true
    } else if (!app.ui.paletteOpen()) {
      app.paused = true
      pause.classList.remove('hidden')
      app.player.enabled = false
    }
  }

  app.player.onKey = (code, value) => {
    if (!app.started) return
    if (code === 'KeyE' || code === 'Tab') {
      const open = !app.ui.paletteOpen()
      app.ui.togglePalette(open)
      if (open) document.exitPointerLock?.()
      return
    }
    if (code.startsWith('Digit')) {
      const n = Number(code.slice(5))
      if (n >= 1 && n <= 9) app.ui.setActive(n - 1)
    }
    if (code === 'KeyQ') app.ui.cycle(-1)
    if (code === 'KeyT') { app.time = (app.time + 0.08) % 1; app.ui.toast(`Time ${(app.time * 24).toFixed(1)}h`) }
  }

  app.ui.onRequestUnlock = () => document.exitPointerLock?.()
  app.ui.onSelect = (id) => app.ui.toast(BLOCKS[id].name)

  canvas.addEventListener('wheel', (e) => { app.ui.cycle(e.deltaY > 0 ? 1 : -1) }, { passive: true })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  document.addEventListener('mousedown', (e) => {
    if (!app.started || !app.player.locked) return
    if (e.button === 0) breakBlock()
    else if (e.button === 2) placeBlock()
  })

  // Hide the loading chip once a decent area exists.
  app._loading = loading
  app._autoStart = false
  // Enter the world automatically shortly after the terrain is ready, so the
  // live world is visible even when pointer lock cannot be acquired.
  const scheduleAutoStart = () => {
    if (app._autoStart || app.started) return
    app._autoStart = true
    setTimeout(() => enterGame(false), 1400)
  }
  app._scheduleAutoStart = scheduleAutoStart
}

function breakBlock() {
  const origin = app.player.eyePosition()
  const dir = app.player.forwardVector()
  const hit = app.world.raycast(origin, dir, REACH)
  if (!hit) return
  const id = app.world.getBlock(hit.x, hit.y, hit.z)
  if (!id) return
  app.world.setBlock(hit.x, hit.y, hit.z, 0)
  app.particles.spawn(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, blockColor(id), 14)
  const def = BLOCKS[id]
  app.sfx.play(def.sound || 'grass', 'break')
}

function overlapsPlayer(bx, by, bz) {
  const p = app.player.position
  const half = app.player.width / 2
  const minX = p.x - half, maxX = p.x + half
  const minY = p.y, maxY = p.y + app.player.height
  const minZ = p.z - half, maxZ = p.z + half
  return (bx < maxX && bx + 1 > minX) && (by < maxY && by + 1 > minY) && (bz < maxZ && bz + 1 > minZ)
}

function placeBlock() {
  const origin = app.player.eyePosition()
  const dir = app.player.forwardVector()
  const hit = app.world.raycast(origin, dir, REACH)
  if (!hit) return
  const id = app.ui.selectedBlock()
  const x = hit.x + hit.nx
  const y = hit.y + hit.ny
  const z = hit.z + hit.nz
  const existing = app.world.getBlock(x, y, z)
  if (existing !== 0 && !app.world.isLiquidAt(x, y, z)) return
  if (isSolid(id) && overlapsPlayer(x, y, z)) return
  app.world.setBlock(x, y, z, id)
  app.sfx.play(BLOCKS[id].sound || 'stone', 'place')
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight
  app.camera.aspect = w / h
  app.camera.updateProjectionMatrix()
  app.renderer.setSize(w, h)
}

let statsTimer = 0
let loadedFrames = 0

function animate() {
  requestAnimationFrame(animate)
  const dt = Math.min(app.clock.getDelta(), 0.1)
  const player = app.player

  // Stream chunks around the player.
  app.world.update(player.position.x, player.position.z, app.started ? 11 : 8)

  app.time = (app.time + dt / DAY_LENGTH) % 1
  const sky = app.sky.update(app.time, app.camera, dt)

  // Sun + lights follow time of day.
  app.sun.position.copy(app.camera.position).addScaledVector(sky.sunDir, 140)
  app.sun.target.position.copy(app.camera.position)
  app.sun.intensity = 0.08 + sky.daylight * 1.7
  app.sun.color.copy(new THREE.Color(0xffb066).lerp(new THREE.Color(0xffffff), Math.min(1, sky.daylight * 1.3)))
  app.hemi.intensity = 0.28 + sky.daylight * 0.72
  app.hemi.color.copy(new THREE.Color(0x223055).lerp(new THREE.Color(0xcfe4ff), sky.daylight))
  app.ambient.intensity = 0.1 + sky.daylight * 0.14
  app.scene.fog.color.copy(sky.horizon)
  app.scene.background = null

  // Only simulate the player once the ground beneath exists.
  const groundReady = !!app.world.getChunk(Math.floor(player.position.x / CHUNK_SIZE), Math.floor(player.position.z / CHUNK_SIZE))
  if (app.started && groundReady) player.update(dt)
  player.updateCamera(app.camera)

  // Block highlight
  if (app.started && player.locked) {
    const hit = app.world.raycast(player.eyePosition(), player.forwardVector(), REACH)
    if (hit) {
      app.highlight.visible = true
      app.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5)
    } else app.highlight.visible = false
  } else app.highlight.visible = false

  app.particles.update(dt)
  app.renderer.render(app.scene, app.camera)

  loadedFrames++
  if (app.world.chunks.size > 16 && !app._autoStart) {
    app._loading?.classList.add('hidden')
    app._scheduleAutoStart?.()
  }

  statsTimer += dt
  if (statsTimer > 0.25) {
    statsTimer = 0
    updateStats(dt)
  }
}

function updateStats(dt) {
  const p = app.player.position
  const biome = app.world.gen.columnInfo(p.x, p.z).biome
  const fps = 1 / Math.max(dt, 0.0001)
  const sel = BLOCKS[app.ui.selectedBlock()]
  const hours = Math.floor(app.time * 24)
  const mins = Math.floor((app.time * 24 - hours) * 60)
  app.ui.setStats(
    `Minecraft 3D   ${fps.toFixed(0)} fps\n` +
    `XYZ  ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}\n` +
    `Biome  ${biome}\n` +
    `Time  ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}\n` +
    `Held  ${sel.name}\n` +
    `Chunks  ${app.world.chunks.size}`
  )
}

app.breakBlock = breakBlock
app.placeBlock = placeBlock
app.blockColor = blockColor

init()
// Defer the first (shader-compiling) frame so the page's load event is not blocked.
requestAnimationFrame(animate)

// Expose a small hook for automated verification.
window.__minecraft = app
