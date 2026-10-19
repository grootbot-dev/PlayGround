import * as THREE from 'three'

const EPS = 1e-4
const GRAVITY = 28
const WATER_GRAVITY = 8
const JUMP_SPEED = 9
const WATER_JUMP = 4.2

export class Player {
  constructor(camera, domElement, world) {
    this.camera = camera
    this.dom = domElement
    this.world = world

    this.position = new THREE.Vector3(0, 40, 0)
    this.velocity = new THREE.Vector3()
    this.yaw = 0
    this.pitch = 0
    this.width = 0.6
    this.height = 1.8
    this.eye = 1.62

    this.onGround = false
    this.inWater = false
    this.flying = false
    this.sprinting = false
    this.locked = false
    this.enabled = false

    this.keys = Object.create(null)
    this.bobTime = 0
    this._tmp = new THREE.Vector3()
    this.onLockChange = null
    this.onKey = null

    this._bind()
  }

  _bind() {
    this._onKeyDown = (e) => {
      if (e.code === 'F5' || (e.ctrlKey && e.code === 'KeyR')) return
      this.keys[e.code] = true
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault()
      if (e.code === 'KeyF') { this.flying = !this.flying; this.velocity.y = 0; this.onKey?.('fly', this.flying) }
      this.onKey?.(e.code)
    }
    this._onKeyUp = (e) => { this.keys[e.code] = false }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)

    this._onMouseMove = (e) => {
      if (!this.locked) return
      const sens = 0.0022
      this.yaw -= e.movementX * sens
      this.pitch -= e.movementY * sens
      const lim = Math.PI / 2 - 0.01
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch))
    }
    document.addEventListener('mousemove', this._onMouseMove)

    this._onLock = () => {
      this.locked = document.pointerLockElement === this.dom
      if (!this.locked) for (const k of Object.keys(this.keys)) this.keys[k] = false
      this.onLockChange?.(this.locked)
    }
    document.addEventListener('pointerlockchange', this._onLock)
  }

  requestLock() {
    this.dom.requestPointerLock?.()
  }

  eyePosition(target = new THREE.Vector3()) {
    return target.set(this.position.x, this.position.y + this.eye, this.position.z)
  }

  forwardVector(target = new THREE.Vector3()) {
    return target.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize()
  }

  _wish() {
    const k = this.keys
    let f = 0, s = 0
    if (k.KeyW || k.ArrowUp) f += 1
    if (k.KeyS || k.ArrowDown) f -= 1
    if (k.KeyD || k.ArrowRight) s += 1
    if (k.KeyA || k.ArrowLeft) s -= 1
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const x = -sin * f + cos * s
    const z = -cos * f - sin * s
    const len = Math.hypot(x, z)
    return len > 0 ? { x: x / len, z: z / len, moving: true } : { x: 0, z: 0, moving: false }
  }

  update(dt) {
    dt = Math.min(dt, 0.05)
    if (!this.enabled) return
    const k = this.keys
    const wish = this._wish()

    const feet = this.world.getBlock(Math.floor(this.position.x), Math.floor(this.position.y + 0.1), Math.floor(this.position.z))
    this.inWater = this.world.isLiquidAt(Math.floor(this.position.x), Math.floor(this.position.y + 0.4), Math.floor(this.position.z)) || feet === 10

    this.sprinting = !!(k.ControlLeft || k.ControlRight) && wish.moving && !this.flying

    if (this.flying) {
      const speed = (k.ControlLeft ? 22 : 11)
      const target = { x: wish.x * speed, z: wish.z * speed }
      this.velocity.x += (target.x - this.velocity.x) * Math.min(1, 10 * dt)
      this.velocity.z += (target.z - this.velocity.z) * Math.min(1, 10 * dt)
      let vy = 0
      if (k.Space) vy += speed
      if (k.ShiftLeft || k.ShiftRight) vy -= speed
      this.velocity.y += (vy - this.velocity.y) * Math.min(1, 10 * dt)
    } else {
      const base = this.inWater ? 3.4 : this.sprinting ? 6.0 : 4.4
      const accel = this.onGround ? 12 : 5
      this.velocity.x += (wish.x * base - this.velocity.x) * Math.min(1, accel * dt)
      this.velocity.z += (wish.z * base - this.velocity.z) * Math.min(1, accel * dt)

      if (this.inWater) {
        this.velocity.y -= WATER_GRAVITY * dt
        if (k.Space) this.velocity.y = WATER_JUMP
        this.velocity.y = Math.max(this.velocity.y, -6)
      } else {
        this.velocity.y -= GRAVITY * dt
        if (k.Space && this.onGround) { this.velocity.y = JUMP_SPEED; this.onGround = false }
      }
    }

    this.onGround = false
    this._moveX(this.velocity.x * dt)
    this._moveZ(this.velocity.z * dt)
    this._moveY(this.velocity.y * dt)

    if (this.position.y < -20) this.respawn()

    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.onGround && speed > 0.6) this.bobTime += dt * speed * 1.6
    else this.bobTime += dt * 0.2
  }

  _voxelSolid(x, y, z) {
    return this.world.isSolidAt(x, y, z)
  }

  _moveX(d) {
    if (d === 0) return
    const p = this.position
    p.x += d
    const half = this.width / 2
    const x0 = Math.floor(p.x - half), x1 = Math.floor(p.x + half - EPS)
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + this.height - EPS)
    const z0 = Math.floor(p.z - half), z1 = Math.floor(p.z + half - EPS)
    let best = d > 0 ? Infinity : -Infinity
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this._voxelSolid(x, y, z)) best = d > 0 ? Math.min(best, x) : Math.max(best, x)
    if (best !== Infinity && best !== -Infinity) {
      p.x = d > 0 ? best - half - EPS : best + 1 + half + EPS
      this.velocity.x = 0
    }
  }

  _moveZ(d) {
    if (d === 0) return
    const p = this.position
    p.z += d
    const half = this.width / 2
    const x0 = Math.floor(p.x - half), x1 = Math.floor(p.x + half - EPS)
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + this.height - EPS)
    const z0 = Math.floor(p.z - half), z1 = Math.floor(p.z + half - EPS)
    let best = d > 0 ? Infinity : -Infinity
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this._voxelSolid(x, y, z)) best = d > 0 ? Math.min(best, z) : Math.max(best, z)
    if (best !== Infinity && best !== -Infinity) {
      p.z = d > 0 ? best - half - EPS : best + 1 + half + EPS
      this.velocity.z = 0
    }
  }

  _moveY(d) {
    if (d === 0) return
    const p = this.position
    p.y += d
    const half = this.width / 2
    const x0 = Math.floor(p.x - half), x1 = Math.floor(p.x + half - EPS)
    const y0 = Math.floor(p.y), y1 = Math.floor(p.y + this.height - EPS)
    const z0 = Math.floor(p.z - half), z1 = Math.floor(p.z + half - EPS)
    let top = -Infinity
    let bottom = Infinity
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++)
          if (this._voxelSolid(x, y, z)) {
            if (d < 0) top = Math.max(top, y + 1)
            else bottom = Math.min(bottom, y)
          }
    if (d < 0 && top !== -Infinity) { p.y = top + EPS; this.velocity.y = 0; this.onGround = true }
    else if (d > 0 && bottom !== Infinity) { p.y = bottom - this.height - EPS; this.velocity.y = 0 }
  }

  respawn() {
    const spawn = this.world.findSpawn()
    this.position.copy(spawn)
    this.velocity.set(0, 0, 0)
  }

  updateCamera(camera) {
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    const bob = this.onGround && speed > 0.6 ? Math.sin(this.bobTime * 2) * 0.045 : 0
    const sway = this.onGround && speed > 0.6 ? Math.cos(this.bobTime) * 0.006 : 0
    camera.position.set(this.position.x, this.position.y + this.eye + bob, this.position.z)
    camera.rotation.set(this.pitch, this.yaw, sway, 'YXZ')
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    document.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('pointerlockchange', this._onLock)
  }
}
