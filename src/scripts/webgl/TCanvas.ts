import * as THREE from 'three'
import { gl } from './core/WebGL'
import { controls } from './utils/OrbitControls'
import { Assets, loadAssets } from './utils/assetLoader'
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader'

export class TCanvas {
  private boids = new THREE.Group()

  private params = {
    speedLimit: 0.08,
    alignScale: 0.5,
    cohesionScale: 0.1,
    separationScale: 0.6,
  }

  private lights = new THREE.Group()

  private assets: Assets = {
    envMap: { path: 'images/blocky_photo_studio_1k.hdr' },
    frame: { path: 'models/frame.glb' },
  }

  constructor(private container: HTMLElement) {
    loadAssets(this.assets).then(() => {
      this.init()
      this.createLights()
      this.createBoundingBox()
      this.createFrame()
      this.createObstacle()
      this.createBoids()
      gl.requestAnimationFrame(this.anime)
    })
  }

  private init() {
    gl.setup(this.container)
    gl.scene.background = new THREE.Color('#0a0a0a')
    gl.camera.position.set(0, 0, 30)

    controls.primitive.enablePan = false
    // gl.scene.add(new THREE.AxesHelper())
  }

  private createLights() {
    gl.scene.add(this.lights)

    const ambientLight = new THREE.AmbientLight('#fff', 0.05)
    this.lights.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight('#f0f0f0', 0.7)
    directionalLight.position.set(10, 8, 15)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.set(2048, 2048)
    const frustum = 15
    directionalLight.shadow.camera = new THREE.OrthographicCamera(-frustum, frustum, frustum, -frustum, 0.01, 40)
    this.lights.add(directionalLight)

    // gl.scene.add(new THREE.CameraHelper(directionalLight.shadow.camera))

    const directionalLight2 = directionalLight.clone()
    directionalLight2.position.set(-10, 8, 15)
    directionalLight2.intensity = 0.2
    this.lights.add(directionalLight2)
  }

  private createBoundingBox() {
    const geometry = new THREE.BoxGeometry(15, 15, 15)
    const material = new THREE.MeshStandardMaterial({ color: '#000', side: THREE.BackSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.name = 'bounding'

    gl.scene.add(mesh)
  }

  private createFrame() {
    const mesh = (this.assets.frame.data as GLTF).scene.children[0] as THREE.Mesh
    mesh.material = new THREE.MeshStandardMaterial({
      envMap: this.assets.envMap.data as THREE.Texture,
      envMapIntensity: 0.1,
      metalness: 1,
      roughness: 0.1,
    })
    mesh.scale.multiplyScalar(0.991)
    gl.scene.add(mesh)
  }

  private createObstacle() {
    const geometry = new THREE.IcosahedronGeometry(1.8, 8)
    const material = new THREE.MeshStandardMaterial()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = 'obstacle'
    gl.scene.add(mesh)
  }

  private createBoids() {
    gl.scene.add(this.boids)

    const rand = (scale = 1) => (Math.random() * 2 - 1) * scale

    const geometry = new THREE.ConeGeometry(0.35, 1, 4)
    const material = new THREE.MeshStandardMaterial()

    for (let i = 0; i < 50; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(rand(3), rand(3), rand(3))
      mesh.userData.velocity = new THREE.Vector3(rand(this.params.speedLimit), rand(this.params.speedLimit), rand(this.params.speedLimit))
      mesh.userData.prevDirection = new THREE.Vector3(0, 1, 0).normalize()
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.boids.add(mesh)
    }
  }

  // ----------------------------------

  private inSight(target: THREE.Object3D, other: THREE.Object3D) {
    return target.position.distanceTo(other.position) < 1.8
  }

  private align(target: THREE.Object3D) {
    const avgVelo = new THREE.Vector3()
    let n = 0
    for (const boid of this.boids.children) {
      if (target === boid || !this.inSight(target, boid)) continue
      avgVelo.add(boid.userData.velocity)
      n++
    }
    if (0 < n) {
      avgVelo.divideScalar(n).multiplyScalar(this.params.alignScale * this.params.speedLimit)
      target.userData.velocity.add(avgVelo)
    }
  }

  private cohesion(target: THREE.Object3D) {
    const avgPos = new THREE.Vector3()
    let n = 0
    for (const boid of this.boids.children) {
      if (target === boid || !this.inSight(target, boid)) continue
      avgPos.add(boid.position)
      n++
    }
    if (0 < n) {
      avgPos.divideScalar(n)
      const cohesionVec = avgPos.sub(target.position).multiplyScalar(this.params.cohesionScale * this.params.speedLimit)
      target.userData.velocity.add(cohesionVec)
    }
  }

  private separation(target: THREE.Object3D) {
    for (const boid of this.boids.children) {
      if (target === boid || !this.inSight(target, boid)) continue
      if (target.position.distanceTo(boid.position) < 1) {
        const fleeVec = target.position
          .clone()
          .sub(boid.position)
          .multiplyScalar(this.params.separationScale * this.params.speedLimit)
        target.userData.velocity.add(fleeVec)
      }
    }
  }

  private bounding(target: THREE.Object3D) {
    const boundingMesh = gl.getMesh('bounding') as THREE.Mesh<THREE.BoxGeometry, THREE.MeshNormalMaterial>
    const { width, height, depth } = boundingMesh.geometry.parameters
    const offset = 0.5
    const [bx, by, bz] = [width / 2 - offset, height / 2 - offset, depth / 2 - offset]

    const turnVec = new THREE.Vector3(1, 1, 1)
    if (target.position.x < -bx && target.userData.velocity.x < 0) turnVec.x = -1
    if (bx < target.position.x && 0 < target.userData.velocity.x) turnVec.x = -1
    if (target.position.y < -by && target.userData.velocity.y < 0) turnVec.y = -1
    if (by < target.position.y && 0 < target.userData.velocity.y) turnVec.y = -1
    if (target.position.z < -bz && target.userData.velocity.z < 0) turnVec.z = -1
    if (bz < target.position.z && 0 < target.userData.velocity.z) turnVec.z = -1

    target.userData.velocity.multiply(turnVec)
  }

  // ----------------------------------
  private raycaster = new THREE.Raycaster()

  private intersectObstacle(target: THREE.Object3D) {
    this.raycaster.set(target.position, target.userData.velocity.clone().normalize())
    const intersections = this.raycaster.intersectObject(gl.getMesh('obstacle'), false)

    if (0 < intersections.length) {
      if (intersections[0].distance < 0.5) {
        target.userData.velocity.multiplyScalar(-1)
      }
    }
  }

  // ----------------------------------
  // animation
  private anime = () => {
    this.boids.children.forEach((target) => {
      this.align(target)
      this.cohesion(target)
      this.separation(target)

      target.userData.velocity.clamp(new THREE.Vector3().addScalar(-this.params.speedLimit), new THREE.Vector3().addScalar(this.params.speedLimit))

      this.intersectObstacle(target)
      this.bounding(target)
      target.position.add(target.userData.velocity)

      // rotate
      let dir = target.userData.velocity.clone().normalize() as THREE.Vector3
      let cos = dir.dot(target.userData.prevDirection)
      let angle = Math.acos(cos)
      let rotateAxis = target.userData.prevDirection.clone().cross(dir).normalize() as THREE.Vector3

      if (0 === rotateAxis.length()) {
        target.userData.velocity.x += 0.001
        dir = target.userData.velocity.clone().normalize() as THREE.Vector3
        cos = dir.dot(target.userData.prevDirection)
        angle = Math.acos(cos)
        rotateAxis = target.userData.prevDirection.clone().cross(dir).normalize() as THREE.Vector3
      }

      const q = new THREE.Quaternion().setFromAxisAngle(rotateAxis, angle)
      target.quaternion.premultiply(q)
      target.userData.prevDirection.copy(dir)
    })

    controls.update()
    gl.render()
  }

  // ----------------------------------
  // dispose
  dispose() {
    gl.dispose()
  }
}
