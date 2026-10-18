import '../App.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/500-italic.css'
import Stage from '../three/Stage'
import Hud from '../three/hud/Hud'

// 单屏固定页: 全屏 3D Stage + HUD 覆盖层, 无滚动。
export default function Home() {
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#d1d2d1]">
      <Stage />
      <Hud />
      <a href="/" data-testid="back-to-lab" className="lab-back">↖ 有趣实验</a>
    </main>
  )
}
