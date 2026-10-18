import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const result = await build({ entryPoints: ['soft-matter/src/three/scene/softbody.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { SoftBody } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

// 隔离环境微颤，测量求解器本身是否保留刚体旋转与回弹。
function specimen(shape) {
  const body = new SoftBody()
  body.setShape(shape, true)
  body.noise = () => 0
  return body
}
function lift(body, height) {
  for (let k = 1; k < body.pos.length; k += 3) {
    body.pos[k] += height
    body.prev[k] += height
  }
}

test('旋转后的自由软体不会被形状匹配反向拧动', () => {
  const body = specimen('star')
  const turn = body.bodyQuat.clone().setFromAxisAngle({ x: 0, y: 0, z: 1 }, 0.6)
  body.rotateAll(turn)
  body.bodyQuat.premultiply(turn)
  lift(body, 4)
  const initial = body.bodyQuat.clone()
  const positions = body.pos.slice()
  body.step(1 / 120)
  assert.ok(initial.angleTo(body.bodyQuat) < 0.01, `姿态误差 ${initial.angleTo(body.bodyQuat)}`)
  let dx = 0, dy = 0, dz = 0
  for (let k = 0; k < positions.length; k += 3) {
    dx += body.pos[k] - positions[k]
    dy += body.pos[k + 1] - positions[k + 1]
    dz += body.pos[k + 2] - positions[k + 2]
  }
  dx /= body.count; dy /= body.count; dz /= body.count
  let error = 0
  for (let k = 0; k < positions.length; k += 3) {
    error = Math.max(error, Math.hypot(body.pos[k] - positions[k] - dx,
      body.pos[k + 1] - positions[k + 1] - dy, body.pos[k + 2] - positions[k + 2] - dz))
  }
  assert.ok(error < 0.001, `无外力形变误差 ${error}`)
  body.dispose()
})

test('抓取时回正让位于用户', () => {
  const body = specimen('cube')
  body.bodyQuat.setFromAxisAngle({ x: 0, y: 0, z: 1 }, 0.8)
  const initial = body.bodyQuat.clone()
  body.beginGrab(0, body.bodyCom)
  body.upright(1 / 60)
  assert.ok(initial.angleTo(body.bodyQuat) < 1e-6)
  body.dispose()
})

test('松手清除旧的沉降计时', () => {
  const body = specimen('apple')
  for (let i = 0; i < 180; i++) body.step(1 / 60)
  body.beginGrab(0, body.bodyCom)
  body.endGrab()
  assert.equal(body.calmT, 0)
  body.dispose()
})

for (const shape of ['star', 'apple', 'cube']) {
  test(`${shape} 静置后从空中释放能落地并回弹`, () => {
    const body = specimen(shape)
    for (let i = 0; i < 180; i++) body.step(1 / 60)
    lift(body, 1.5)
    let contact = false, upward = 0
    for (let i = 0; i < 180; i++) {
      const y = body.bodyCom.y
      body.step(1 / 60)
      let minY = Infinity
      for (let k = 1; k < body.pos.length; k += 3) minY = Math.min(minY, body.pos[k])
      if (minY < 0.015) contact = true
      if (contact) upward = Math.max(upward, (body.bodyCom.y - y) * 60)
    }
    assert.ok(contact, '3 秒内应该触地')
    assert.ok(upward > 0.15, `落地向上回弹速度 ${upward}`)
    body.dispose()
  })
}

for (const shape of ['star', 'apple', 'cube']) {
  test(`${shape} 默认/软/硬模式扰动后稳定，不上飘`, () => {
    for (const stiffness of [0.1, 0.2155, 0.43]) {
      const body = new SoftBody()
      body.setShape(shape, true)
      body.params.stiffness = stiffness
      body.nudge(0.6, 0.8, 0.07)
      for (let i = 0; i < 1800; i++) body.step(1 / 60)
      assert.ok(body.speed < 0.4, `stiffness=${stiffness}, speed=${body.speed}`)
      assert.ok(body.bodyCom.y < 1.7 && body.bodyCom.y > 0.4, `height=${body.bodyCom.y}`)
      assert.ok(body.pos.every(Number.isFinite))
      body.dispose()
    }
  })
}

test('回正保持偏航、同步姿态且不凭空抬高悬空标本', () => {
  const body = specimen('cube')
  const turn = body.bodyQuat.clone().setFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.9)
  body.rotateAll(turn)
  body.bodyQuat.premultiply(turn)
  const yaw = body.bodyQuat.clone()
  body.upright(1 / 60)
  assert.ok(yaw.angleTo(body.bodyQuat) < 1e-6)
  turn.setFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.8)
  body.rotateAll(turn)
  body.bodyQuat.premultiply(turn)
  lift(body, 4)
  body.bodyCom.y += 4
  const height = body.bodyCom.y
  body.upright(1 / 60)
  assert.ok(body.bodyCom.y <= height + 1e-6)
  const corrected = body.bodyQuat.clone()
  body.shape = 'star' // 仅隔离后续自动回正，检测形状匹配是否撤销刚才的校正。
  body.step(1 / 120)
  assert.ok(corrected.angleTo(body.bodyQuat) < 0.01)
  body.dispose()
})

test('连续切换 12 次以及 Reset 清除旧抓取与姿态', () => {
  const body = specimen('cube')
  for (let i = 0; i < 12; i++) {
    const shape = ['apple', 'star', 'cube'][i % 3]
    body.beginGrab(0, body.bodyCom)
    body.setShape(shape, true)
    assert.equal(body.grabbed, -1)
    assert.deepEqual(body.pos, body.prev)
    assert.ok(body.pos.every(Number.isFinite))
  }
  body.setShape('apple', true)
  body.nudge(1, 0, 0.07)
  body.step(1 / 60)
  body.reset()
  assert.equal(body.bodyQuat.w, 1)
  assert.deepEqual(body.pos, body.rest)
  body.dispose()
})
