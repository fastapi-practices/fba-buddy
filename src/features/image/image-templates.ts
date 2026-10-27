import type { TranslationKey } from "@/lib/i18n"
export type ImageTemplate = {
  id: string
  label: TranslationKey
  prompt: string
  src: string
}

const IMAGE_FAN_WINDOW = 2

export const IMAGE_TEMPLATES: readonly ImageTemplate[] = [
  {
    id: "lifestyle",
    label: "common.greenEyedCat",
    prompt:
      "虎斑猫面部特写，翠绿色眼睛直视镜头，白色长胡须，粉棕色鼻子，耳廓透光，背景是干净的明蓝色天空，阳光从侧面打亮毛发，宠物肖像摄影，竖构图",
    src: "/image-templates/lifestyle.jpg?v=3",
  },
  {
    id: "summer",
    label: "common.kyotoDusk",
    prompt:
      "黄昏时分京都石板坡道，两名身着和服的女子背对镜头走向上坡，一人深色和服一人浅粉色和服，远处五重塔剪影，天空从橙粉过渡到深蓝，两侧是木质町屋、青瓦与竹篱，旅行风光摄影，竖构图",
    src: "/image-templates/summer.jpg?v=3",
  },
  {
    id: "swordsman",
    label: "common.girlInAStrawHat",
    prompt:
      "年轻东亚女性侧脸看向画面右侧，戴米白色编织宽檐草帽，帽檐点缀白花与绿叶，穿白色薄纱上衣，细金项链，面颊有细闪光点，黑色长发，背景是虚化的绿叶与粉红色花朵，侧前方阳光，清新人像摄影，竖构图",
    src: "/image-templates/swordsman.jpg?v=3",
  },
  {
    id: "ramen",
    label: "common.sushiRolls",
    prompt:
      "日式寿司卷特写，深色长盘上摆着一排加州卷，上层是三文鱼片，点缀青葱与酱汁，米饭中有蟹肉棒和黄瓜，旁边有绿色竹叶垫，浅景深，暖色餐厅灯光，美食摄影，竖构图",
    src: "/image-templates/ramen.jpg?v=3",
  },
  {
    id: "barista",
    label: "common.teaAndCookies",
    prompt:
      "白色背景上的静物：一杯盛在白瓷杯里的奶茶，杯子放在小块木质杯垫上，杯前两块巧克力豆饼干，柔和影棚光，极简产品摄影，竖构图",
    src: "/image-templates/barista.jpg?v=3",
  },
  {
    id: "flowers",
    label: "common.cherryBlossoms",
    prompt:
      "特写盛开的粉色樱花，花瓣层层叠叠，花心淡黄，枝条伸向干净的明蓝色天空，阳光通透，春日花卉摄影，竖构图",
    src: "/image-templates/flowers.jpg?v=3",
  },
  {
    id: "neon",
    label: "common.shibuyaNightStreet",
    prompt:
      "夜晚东京涩谷购物街，湿润地砖倒映青蓝与品红霓虹，头顶玻璃连廊和自动扶梯横跨街道，两侧是密集的日文灯箱与商店，行人走过斑马线，赛博朋克色调，街拍广角竖构图",
    src: "/image-templates/neon.jpg?v=3",
  },
  {
    id: "scientist",
    label: "common.beachSunset",
    prompt:
      "热带海滩日落，浅金色阳光铺在细白沙滩上，碧蓝海水卷起白色泡沫，天空有淡粉云朵，地平线干净，旅行风光摄影，竖构图",
    src: "/image-templates/scientist.jpg?v=3",
  },
  {
    id: "farmer",
    label: "common.seasonalFruit",
    prompt:
      "俯拍白色桌面上的新鲜水果静物，切开的木瓜、葡萄柚、牛油果和猕猴桃，还有柠檬、青柠、橙子、葡萄和菠萝，色彩鲜艳，自然光，食物摄影，竖构图",
    src: "/image-templates/farmer.jpg?v=3",
  },
  {
    id: "architecture",
    label: "common.geometricWindows",
    prompt:
      "黑白建筑特写，弧形外墙上重复的菱形窗格，每扇窗嵌在凹陷的混凝土框里，光影分明，极少主义建筑摄影，竖构图",
    src: "/image-templates/architecture.jpg?v=3",
  },
  {
    id: "mountain",
    label: "common.earthFromOrbit",
    prompt:
      "从近地轨道俯瞰地球，弯曲地平线上方是黑色太空和一层薄蓝色大气，下方是大面积白云与海洋，阳光从侧面照射云层，航天摄影，竖构图",
    src: "/image-templates/mountain.jpg?v=3",
  },
]

export const DEFAULT_TEMPLATE_ID = "swordsman"

export function wrapOffset(
  index: number,
  selected: number,
  length: number
): number {
  if (length <= 0) {
    return 0
  }
  let diff = (((index - selected) % length) + length) % length
  if (diff > length / 2) {
    diff -= length
  }
  return diff
}

export function isFanVisible(
  offset: number,
  window = IMAGE_FAN_WINDOW
): boolean {
  return Math.abs(offset) <= window
}

export function fanPose(offset: number): {
  rotate: number
  rotateY: number
  offsetY: number
  translateX: number
  scale: number
  brightness: number
} {
  const distance = Math.abs(offset)
  return {
    rotate: offset * 8,
    rotateY: offset === 0 ? 0 : offset * -18,
    offsetY: distance * 10,
    translateX: offset * 7.35,
    scale: distance === 0 ? 1 : 1 - distance * 0.06,
    brightness: Math.max(0.72, 1 - distance * 0.1),
  }
}

export function templateIndexById(
  id: string,
  templates: readonly ImageTemplate[] = IMAGE_TEMPLATES
): number {
  const index = templates.findIndex((item) => item.id === id)
  return index >= 0 ? index : 0
}

export function visibleFanTemplates(
  selectedIndex: number,
  templates: readonly ImageTemplate[] = IMAGE_TEMPLATES,
  window = IMAGE_FAN_WINDOW
) {
  return templates
    .map((template, index) => ({
      template,
      index,
      offset: wrapOffset(index, selectedIndex, templates.length),
    }))
    .filter((item) => isFanVisible(item.offset, window))
    .sort((a, b) => a.offset - b.offset)
}
