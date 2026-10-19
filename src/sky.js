import * as THREE from 'three'
import { mulberry32 } from './noise.js'

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function makeCloudTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const rng = mulberry32(4242)
  ctx.clearRect(0, 0, size, size)
  for (let i = 0; i < 90; i++) {
    const x = rng() * size
    const y = rng() * size
    const r = 8 + rng() * 34
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const a = 0.18 + rng() * 0.4
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    g.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    // draw with wrapped copies so the tile is seamless
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save()
        ctx.translate(dx, dy)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(5, 5)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export class Sky {
  constructor(scene) {
    this.scene = scene

    this.uniforms = {
      topColor: { value: new THREE.Color(0x4a90d9) },
      horizonColor: { value: new THREE.Color(0xa9d3f5) },
      sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
      sunColor: { value: new THREE.Color(0xfff2c8) }
    }

    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        uniform vec3 sunDir;
        void main() {
          float h = clamp(vDir.y, -1.0, 1.0);
          float t = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.7);
          vec3 col = mix(horizonColor, topColor, smoothstep(0.0, 0.85, t));
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * pow(d, 320.0) * 0.9;
          col += sunColor * pow(d, 8.0) * 0.14;
          gl_FragColor = vec4(col, 1.0);
        }`
    })

    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
    scene.add(this.mesh)

    this.cloudMaterial = new THREE.MeshBasicMaterial({
      map: makeCloudTexture(), transparent: true, depthWrite: false,
      side: THREE.DoubleSide, fog: false, opacity: 0.85
    })
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), this.cloudMaterial)
    this.clouds.rotation.x = -Math.PI / 2
    this.clouds.position.y = 150
    this.clouds.renderOrder = -5
    this.clouds.frustumCulled = false
    scene.add(this.clouds)

    // Stars
    const starCount = 900
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const u = Math.random()
      const v = Math.random() * 0.5 + 0.02
      const theta = u * Math.PI * 2
      const phi = Math.acos(v)
      const r = 560
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi)
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })
    this.stars = new THREE.Points(starGeo, this.starMaterial)
    this.stars.renderOrder = -6
    this.stars.frustumCulled = false
    scene.add(this.stars)

    this.sunDir = new THREE.Vector3()
    this.horizon = new THREE.Color(0xa9d3f5)

    this._dayTop = new THREE.Color(0x4a90d9)
    this._dayHorizon = new THREE.Color(0xa9d3f5)
    this._nightTop = new THREE.Color(0x04060f)
    this._nightHorizon = new THREE.Color(0x0d1730)
    this._duskHorizon = new THREE.Color(0xff9a4d)
    this._duskTop = new THREE.Color(0x2b3a68)
    this._sunDay = new THREE.Color(0xfff4d6)
    this._sunDusk = new THREE.Color(0xff9a4d)
  }

  // time: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
  update(time, camera, dt) {
    const theta = (time - 0.25) * Math.PI * 2
    this.sunDir.set(Math.cos(theta) * 0.72, Math.sin(theta), 0.34).normalize()

    const up = this.sunDir.y
    const dayAmt = smoothstep(-0.05, 0.32, up)
    const nightAmt = 1 - smoothstep(-0.22, 0.05, up)
    const duskAmt = Math.max(0, 1 - dayAmt - nightAmt)
    const horizonGlow = Math.exp(-Math.pow(up / 0.16, 2))

    const top = this._nightTop.clone().lerp(this._dayTop, dayAmt).lerp(this._duskTop, duskAmt * 0.8)
    const horizon = this._nightHorizon.clone().lerp(this._dayHorizon, dayAmt).lerp(this._duskHorizon, horizonGlow * 0.85)

    this.uniforms.topColor.value.copy(top)
    this.uniforms.horizonColor.value.copy(horizon)
    this.uniforms.sunDir.value.copy(this.sunDir)
    this.uniforms.sunColor.value.copy(this._sunDusk.clone().lerp(this._sunDay, smoothstep(0.05, 0.4, up)))
    this.horizon.copy(horizon)

    this.mesh.position.copy(camera.position)
    this.stars.position.copy(camera.position)
    this.stars.rotation.y = time * Math.PI * 2
    this.starMaterial.opacity = Math.max(0, nightAmt) * 0.9

    this.clouds.position.x = camera.position.x
    this.clouds.position.z = camera.position.z
    if (dt && this.cloudMaterial.map) {
      this.cloudMaterial.map.offset.x += dt * 0.0016
      this.cloudMaterial.map.offset.y += dt * 0.0006
    }
    this.cloudMaterial.opacity = 0.5 + dayAmt * 0.4
    this.cloudMaterial.color.setRGB(1, 1, 1).lerp(new THREE.Color(0x223055), nightAmt * 0.7)

    return {
      sunDir: this.sunDir,
      daylight: dayAmt,
      night: nightAmt,
      dusk: duskAmt,
      horizon
    }
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.clouds.geometry.dispose()
    this.cloudMaterial.map?.dispose()
    this.cloudMaterial.dispose()
    this.stars.geometry.dispose()
    this.starMaterial.dispose()
  }
}
