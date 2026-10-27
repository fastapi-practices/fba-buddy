const MODELS = [
  { id: "gpt5", name: "GPT-5", short: "GPT-5", provider: "OpenAI", tone: "emerald", ctx: 128, ctxText: "128k", price: "$1.25 / 10M", priceVal: 1.25, caps: ["思考", "工具"] },
  { id: "gpt5m", name: "GPT-5 mini", short: "5 mini", provider: "OpenAI", tone: "emerald", ctx: 128, ctxText: "128k", price: "$0.25 / 2M", priceVal: 0.25, caps: ["工具"] },
  { id: "claude", name: "Claude Sonnet 4.5", short: "Claude 4.5", provider: "Anthropic", tone: "orange", ctx: 200, ctxText: "200k", price: "$3 / 15M", priceVal: 3, caps: ["思考", "视觉"] },
  { id: "gemini", name: "Gemini 2.5 Pro", short: "Gemini 2.5", provider: "Google", tone: "blue", ctx: 1000, ctxText: "1M", price: "$1.25 / 10M", priceVal: 1.25, caps: ["视觉"] },
  { id: "deepseek", name: "DeepSeek V3", short: "DeepSeek", provider: "OpenRouter", tone: "violet", ctx: 128, ctxText: "128k", price: "$0.27 / 1.1M", priceVal: 0.27, caps: ["工具"] },
]

const PROVIDERS = ["OpenAI", "Anthropic", "Google", "OpenRouter"]
const EFFORTS = ["关闭", "最低", "低", "中", "高"]
const TONE_COLOR = {
  emerald: "#34d399",
  orange: "#fb923c",
  blue: "#60a5fa",
  violet: "#a78bfa",
}

const toneClass = (tone) => `solid-${tone}`

// 顶部切换
const schemes = Array.from(document.querySelectorAll(".pscheme"))
const tabsBox = document.getElementById("tabs")
const tabButtons = schemes.map((scheme, index) => {
  const button = document.createElement("button")
  button.className = "pv-tab" + (index === 0 ? " on" : "")
  button.innerHTML = `<b>${scheme.dataset.title.slice(0, 2)}</b>${scheme.dataset.title}`
  button.addEventListener("click", () => {
    schemes.forEach((item) => item.classList.remove("on"))
    tabButtons.forEach((item) => item.classList.remove("on"))
    scheme.classList.add("on")
    button.classList.add("on")
  })
  tabsBox.appendChild(button)
  return button
})

function buildSlots(host, active, onPick) {
  host.innerHTML = ""
  EFFORTS.forEach((name, index) => {
    const slot = document.createElement("span")
    slot.className = "eslot" + (index <= active ? " on" : "") + (index > 0 && index < 4 ? " mid" : "")
    slot.title = name
    slot.addEventListener("click", () => onPick(index))
    host.appendChild(slot)
  })
}

// ---------- P1 手牌扇形 ----------

const hand = document.getElementById("hand")
const handSlots = document.getElementById("handSlots")
const handEffort = document.getElementById("handEffort")
let handIndex = 0
let handEffortIndex = 3

MODELS.forEach((model, index) => {
  const card = document.createElement("div")
  const offset = index - (MODELS.length - 1) / 2
  card.className = "pcard" + (index === handIndex ? " on" : "")
  card.style.setProperty("--x", `${offset * 126}px`)
  card.style.setProperty("--y", `${Math.abs(offset) * 12}px`)
  card.style.setProperty("--r", `${offset * 11}deg`)
  card.style.zIndex = String(MODELS.length - index)
  card.innerHTML = `
    <span class="logo ${toneClass(model.tone)}">${model.name.slice(0, 3)}</span>
    <div class="ttl">${model.name}</div>
    <div class="ctxbar"><i style="width: ${Math.min(100, (model.ctx / 1000) * 100)}%"></i></div>
    <div class="caps">${model.caps.map((cap) => `<span>${cap}</span>`).join("")}</div>
    <div class="price">${model.ctxText} · ${model.price}</div>
  `
  card.addEventListener("click", () => {
    handIndex = index
    hand.querySelectorAll(".pcard").forEach((item, i) => item.classList.toggle("on", i === index))
  })
  hand.appendChild(card)
})

function syncHandSlots() {
  buildSlots(handSlots, handEffortIndex, (index) => {
    handEffortIndex = index
    handEffort.textContent = EFFORTS[index]
    syncHandSlots()
  })
}
syncHandSlots()

// ---------- P2 调音台 ----------

const mixerTracks = document.getElementById("mixerTracks")
const vuCtx = document.getElementById("vuCtx")
const vuCtxBar = document.getElementById("vuCtxBar")
const vuPrice = document.getElementById("vuPrice")
const vuPriceBar = document.getElementById("vuPriceBar")
const vuEffort = document.getElementById("vuEffort")
const mixerSlots = document.getElementById("mixerSlots")
let mixerModel = MODELS[0]
let mixerEffort = 3

PROVIDERS.forEach((provider) => {
  const models = MODELS.filter((model) => model.provider === provider)
  if (!models.length) return
  const column = document.createElement("div")
  column.className = "mtrack"
  const rail = document.createElement("div")
  rail.className = "mrail"
  models.forEach((model, index) => {
    const cap = document.createElement("div")
    cap.className = "mcap" + (model.id === mixerModel.id ? " on" : "")
    cap.textContent = model.short
    cap.title = `${model.name} · ${model.ctxText}`
    // 同一供应商里上下文长度接近时错开，避免推子叠在一起
    cap.style.bottom = `${8 + (model.ctx / 1000) * 190 + index * 24}px`
    cap.addEventListener("click", () => {
      mixerModel = model
      mixerTracks.querySelectorAll(".mcap").forEach((item) => item.classList.remove("on"))
      cap.classList.add("on")
      syncVu()
    })
    rail.appendChild(cap)
  })
  column.appendChild(rail)
  const label = document.createElement("div")
  label.className = "prov"
  label.textContent = provider
  column.appendChild(label)
  mixerTracks.appendChild(column)
})

function syncVu() {
  vuCtx.textContent = mixerModel.ctxText
  vuCtxBar.style.width = `${Math.min(100, (mixerModel.ctx / 1000) * 100)}%`
  vuPrice.textContent = mixerModel.price
  vuPriceBar.style.width = `${Math.min(100, (mixerModel.priceVal / 4) * 100)}%`
  vuEffort.textContent = `${mixerEffort + 1} / 5`
}
syncVu()

function syncMixerSlots() {
  buildSlots(mixerSlots, mixerEffort, (index) => {
    mixerEffort = index
    syncVu()
    syncMixerSlots()
  })
}
syncMixerSlots()

// ---------- P3 模型商店 ----------

const shop = document.getElementById("shop")
const cartItem = document.getElementById("cartItem")
let cartModel = MODELS[0]

const shelves = [
  { label: "常用 · 主力模型", items: MODELS.slice(0, 3) },
  { label: "长上下文 · 备用", items: MODELS.slice(3) },
]
shelves.forEach((group) => {
  const shelf = document.createElement("div")
  shelf.className = "shelf"
  const label = document.createElement("div")
  label.className = "label"
  label.textContent = group.label
  shelf.appendChild(label)
  group.items.forEach((model) => {
    const item = document.createElement("div")
    item.className = "sitem" + (model.id === cartModel.id ? " on" : "")
    item.innerHTML = `
      <div class="shanger"></div>
      <div class="sgood">
        <span class="logo ${toneClass(model.tone)}">${model.name.slice(0, 3)}</span>
        <div class="nm">${model.name}</div>
        <div class="meta" style="margin-top: 4px">${model.ctxText}</div>
      </div>
      <div class="stag">${model.price}</div>
    `
    item.addEventListener("click", () => {
      cartModel = model
      shop.querySelectorAll(".sitem").forEach((node) => node.classList.remove("on"))
      item.classList.add("on")
      cartItem.textContent = model.name
    })
    shelf.appendChild(item)
  })
  shop.appendChild(shelf)
})

// ---------- P4 唱片点唱机 ----------

const tracksHost = document.getElementById("tracks")
const vinyl = document.getElementById("vinyl")
const vinylLabel = document.getElementById("vinylLabel")
const vneedle = document.getElementById("vneedle")
const knobNeedle = document.getElementById("knobNeedle")
const knobLabel = document.getElementById("knobLabel")
const jukeboxSlots = document.getElementById("jukeboxSlots")
let jukeboxModel = MODELS[0]
let jukeboxEffort = 3

MODELS.forEach((model, index) => {
  const track = document.createElement("div")
  track.className = "track" + (index === 0 ? " on" : "")
  track.innerHTML = `
    <span style="color: ${TONE_COLOR[model.tone]}">●</span>
    <span>${model.name}</span>
    <span class="dur">${model.ctxText}</span>
  `
  track.addEventListener("click", () => {
    jukeboxModel = model
    tracksHost.querySelectorAll(".track").forEach((node) => node.classList.remove("on"))
    track.classList.add("on")
    vinylLabel.textContent = model.name
    vinylLabel.className = `vlabel ${toneClass(model.tone)}`
    vinyl.classList.add("fast")
    vneedle.classList.add("drop")
    setTimeout(() => vinyl.classList.remove("fast"), 1600)
  })
  tracksHost.appendChild(track)
})

function syncJukeboxSlots() {
  buildSlots(jukeboxSlots, jukeboxEffort, (index) => {
    jukeboxEffort = index
    knobLabel.textContent = EFFORTS[index]
    knobNeedle.style.transform = `rotate(${-120 + index * 60}deg)`
    syncJukeboxSlots()
  })
}
syncJukeboxSlots()

// ---------- P5 飞行仪表 ----------

const dialTicks = document.getElementById("dialTicks")
const dialNeedle = document.getElementById("dialNeedle")
const dialReadout = document.getElementById("dialReadout")
const gearbox = document.getElementById("gearbox")
const modelstrip = document.getElementById("modelstrip")
let cockpitProvider = "OpenAI"
let cockpitModel = MODELS[0]
let cockpitEffort = 3

for (let index = 0; index < 11; index += 1) {
  const tick = document.createElement("i")
  tick.style.transform = `rotate(${-120 + index * 24}deg)`
  dialTicks.appendChild(tick)
}

PROVIDERS.forEach((provider) => {
  const gear = document.createElement("div")
  gear.className = "gear" + (provider === cockpitProvider ? " on" : "")
  gear.innerHTML = `<span class="lever"></span>${provider}`
  gear.addEventListener("click", () => {
    cockpitProvider = provider
    const first = MODELS.find((model) => model.provider === provider)
    if (first) cockpitModel = first
    gearbox.querySelectorAll(".gear").forEach((node) => node.classList.remove("on"))
    gear.classList.add("on")
    syncStrip()
  })
  gearbox.appendChild(gear)
})

function syncStrip() {
  modelstrip.innerHTML = ""
  MODELS.filter((model) => model.provider === cockpitProvider).forEach((model) => {
    const row = document.createElement("div")
    row.className = "mstrip" + (model.id === cockpitModel.id ? " on" : "")
    row.innerHTML = `<span class="logo ${toneClass(model.tone)}">${model.name.slice(0, 3)}</span>${model.name}`
    row.addEventListener("click", () => {
      cockpitModel = model
      syncStrip()
    })
    modelstrip.appendChild(row)
  })
}
syncStrip()

dialNeedle.style.transform = `rotate(${-120 + cockpitEffort * 24}deg)`
dialReadout.textContent = EFFORTS[cockpitEffort]

// ---------- P6 老虎机 ----------

const reel1 = document.getElementById("reel1")
const reel2 = document.getElementById("reel2")
const reel3 = document.getElementById("reel3")
const slotNote = document.getElementById("slotNote")
const ITEM_H = 58

const REEL_COPIES = 12

function buildReelItems(base) {
  const out = []
  for (let copy = 0; copy < REEL_COPIES; copy += 1) out.push(...base)
  return out
}

const reel1Items = buildReelItems(PROVIDERS)
const reel2Items = buildReelItems(MODELS.map((model) => model.short))
const reel3Items = buildReelItems(EFFORTS)

function fillReel(host, items) {
  host.innerHTML = items.map((item) => `<div>${item}</div>`).join("")
}
fillReel(reel1, reel1Items)
fillReel(reel2, reel2Items)
fillReel(reel3, reel3Items)

// 滚轮：先快速空转，再停在目标那一格
function spinReel(host, base, targetIndex, done) {
  const len = base.length
  const finalPos = len * (REEL_COPIES - 3) + targetIndex - 1
  let position = 0
  let step = 0
  const tick = () => {
    step += 1
    if (position < finalPos - 30) {
      position += 3 + Math.floor(Math.random() * 5)
      host.style.transform = `translateY(${-position * ITEM_H}px)`
      setTimeout(tick, 60 + step * 8)
      return
    }
    position = finalPos
    host.style.transform = `translateY(${-position * ITEM_H}px)`
    setTimeout(done, 380)
  }
  tick()
}

document.getElementById("lever").addEventListener("click", () => {
  const providerIndex = Math.floor(Math.random() * PROVIDERS.length)
  const candidates = MODELS.filter((model) => model.provider === PROVIDERS[providerIndex])
  const modelIndex = Math.floor(Math.random() * candidates.length)
  const effortIndex = Math.floor(Math.random() * EFFORTS.length)
  slotNote.textContent = "转啊转…"
  spinReel(reel1, PROVIDERS, providerIndex, () => {
    spinReel(reel2, MODELS.map((model) => model.short), modelIndex, () => {
      spinReel(reel3, EFFORTS, effortIndex, () => {
        slotNote.textContent = `${PROVIDERS[providerIndex]} · ${candidates[modelIndex].name} · 思考 ${EFFORTS[effortIndex]}`
      })
    })
  })
})

// ---------- P7 复古 HUD ----------

const hudSlots = document.getElementById("hudSlots")
const hudModel = document.getElementById("hudModel")
const hudBtn = document.getElementById("hudBtn")
let hudCurrent = MODELS[0]

MODELS.forEach((model) => {
  const slot = document.createElement("div")
  slot.className = "hslot" + (model.id === hudCurrent.id ? " on" : "")
  slot.innerHTML = `<span style="color: ${TONE_COLOR[model.tone]}">■</span>${model.name}`
  slot.addEventListener("click", () => {
    hudCurrent = model
    hudSlots.querySelectorAll(".hslot").forEach((node) => node.classList.remove("on"))
    slot.classList.add("on")
    hudModel.textContent = model.name
  })
  hudSlots.appendChild(slot)
})
hudBtn.addEventListener("click", () => {
  hudBtn.textContent = "[ 已装备 ]"
  setTimeout(() => {
    hudBtn.textContent = "[ 装备此模型 ]"
  }, 1200)
})

// ---------- P8 漂浮气泡 ----------

const bubbles = document.getElementById("bubbles")
const bubbleSlots = document.getElementById("bubbleSlots")
const bubbleEffort = document.getElementById("bubbleEffort")
let bubbleEffortIndex = 3

const positions = [
  { left: "14%", top: "16%" },
  { left: "46%", top: "9%" },
  { left: "72%", top: "22%" },
  { left: "26%", top: "40%" },
  { left: "62%", top: "46%" },
]

MODELS.forEach((model, index) => {
  const bubble = document.createElement("div")
  const size = 78 + (model.ctx / 1000) * 56
  bubble.className = "bubble" + (index === 0 ? " on" : "")
  bubble.style.width = `${size}px`
  bubble.style.height = `${size}px`
  bubble.style.left = positions[index].left
  bubble.style.top = positions[index].top
  bubble.style.setProperty("--tone", TONE_COLOR[model.tone])
  bubble.style.animationDuration = `${11 + index * 2.4}s`
  bubble.style.animationDelay = `${-index * 1.7}s`
  bubble.innerHTML = `<div><div class="nm">${model.short}</div><div class="sb">${model.ctxText}</div></div>`
  bubble.addEventListener("click", () => {
    bubbles.querySelectorAll(".bubble").forEach((node) => node.classList.remove("on"))
    bubble.classList.add("on")
  })
  bubbles.appendChild(bubble)
})

function syncBubbleSlots() {
  buildSlots(bubbleSlots, bubbleEffortIndex, (index) => {
    bubbleEffortIndex = index
    bubbleEffort.textContent = EFFORTS[index]
    syncBubbleSlots()
  })
}
syncBubbleSlots()
