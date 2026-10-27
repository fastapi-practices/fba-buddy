const schemes = Array.from(document.querySelectorAll(".scheme"))
const tabsBox = document.getElementById("tabs")

const tabButtons = schemes.map((scheme, index) => {
  const button = document.createElement("button")
  button.className = "tab" + (index === 0 ? " on" : "")
  button.innerHTML = `<b>${String(index + 1).padStart(2, "0")}</b>${scheme.dataset.title}`
  button.addEventListener("click", () => {
    schemes.forEach((item) => item.classList.remove("on"))
    tabButtons.forEach((item) => item.classList.remove("on"))
    scheme.classList.add("on")
    button.classList.add("on")
  })
  tabsBox.appendChild(button)
  return button
})

// 02 环形轮盘：外环供应商，内环全部模型，中心是当前目标
const WHEEL = [
  { name: "OpenAI", tone: "#34d399", models: [
    { name: "GPT-5", meta: "128k", model: "GPT-5" },
    { name: "GPT-5 mini", meta: "128k", model: "GPT-5 mini" },
  ] },
  { name: "Anthropic", tone: "#fb923c", models: [
    { name: "Claude 4.5", meta: "200k", model: "Claude Sonnet 4.5" },
  ] },
  { name: "Google", tone: "#60a5fa", models: [
    { name: "Gemini 2.5", meta: "1M", model: "Gemini 2.5 Pro" },
  ] },
  { name: "OpenRouter", tone: "#a78bfa", models: [
    { name: "DeepSeek V3", meta: "128k", model: "DeepSeek V3" },
  ] },
]

const wheelSvg = document.getElementById("wheel")
const wheelCenter = document.querySelector(".s2 .wheel-center")
const CX = 260
const CY = 260

function arcPath(rOuter, rInner, a0, a1) {
  const point = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)]
  const [x0, y0] = point(rOuter, a0)
  const [x1, y1] = point(rOuter, a1)
  const [x2, y2] = point(rInner, a1)
  const [x3, y3] = point(rInner, a0)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)} A${rInner} ${rInner} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`
}

const flatModels = []
WHEEL.forEach((provider) => {
  provider.models.forEach((model) => flatModels.push({ ...model, provider }))
})

function buildWheel() {
  const parts = []

  WHEEL.forEach((item, index) => {
    const span = (Math.PI * 2) / WHEEL.length
    const a0 = -Math.PI / 2 + index * span + 0.035
    const a1 = -Math.PI / 2 + (index + 1) * span - 0.035
    const mid = (a0 + a1) / 2
    const lx = CX + 197 * Math.cos(mid)
    const ly = CY + 197 * Math.sin(mid) + 4
    parts.push(
      `<path d="${arcPath(232, 162, a0, a1)}" fill="${item.tone}" fill-opacity="0.1" stroke="${item.tone}" stroke-opacity="0.25" class="sect" data-provider="${item.name}" data-kind="provider"/>`
    )
    parts.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="12" fill="#7c7c89" pointer-events="none" data-label="${item.name}">${item.name}</text>`
    )
  })

  flatModels.forEach((item, index) => {
    const span = (Math.PI * 2) / flatModels.length
    const a0 = -Math.PI / 2 + index * span + 0.05
    const a1 = -Math.PI / 2 + (index + 1) * span - 0.05
    const mid = (a0 + a1) / 2
    const lx = CX + 126 * Math.cos(mid)
    const ly = CY + 126 * Math.sin(mid) + 3.5
    parts.push(
      `<path d="${arcPath(152, 92, a0, a1)}" fill="${item.provider.tone}" fill-opacity="0.08" stroke="${item.provider.tone}" stroke-opacity="0.2" class="sect" data-provider="${item.provider.name}" data-model="${item.model}" data-kind="model"/>`
    )
    parts.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="10.5" fill="#6f6f7c" pointer-events="none" data-model-label="${item.model}">${item.name}</text>`
    )
  })

  parts.push(`<circle cx="${CX}" cy="${CY}" r="86" fill="#0e0e12" stroke="#26262e"/>`)

  wheelSvg.innerHTML = parts.join("")

  wheelSvg.querySelectorAll(".sect").forEach((node) => {
    node.addEventListener("mouseenter", () => {
      highlightWheel(node.dataset.provider, node.dataset.model)
    })
  })
}

function highlightWheel(providerName, modelName) {
  const target =
    flatModels.find((item) => item.model === modelName) ??
    flatModels.find((item) => item.provider.name === providerName) ??
    flatModels[0]

  wheelSvg.querySelectorAll('[data-kind="provider"]').forEach((node) => {
    const active = node.dataset.provider === providerName
    node.setAttribute("fill-opacity", active ? "0.34" : "0.1")
    node.setAttribute("stroke-opacity", active ? "0.75" : "0.25")
  })

  wheelSvg.querySelectorAll('[data-kind="model"]').forEach((node) => {
    const active = node.dataset.model === target.model
    node.setAttribute("fill-opacity", active ? "0.42" : "0.08")
    node.setAttribute("stroke-opacity", active ? "0.9" : "0.2")
  })

  wheelSvg.querySelectorAll("[data-label]").forEach((node) => {
    node.setAttribute(
      "fill",
      node.dataset.label === providerName ? "#ececf3" : "#7c7c89"
    )
  })

  wheelSvg.querySelectorAll("[data-model-label]").forEach((node) => {
    node.setAttribute(
      "fill",
      node.dataset.modelLabel === target.model ? "#ececf3" : "#6f6f7c"
    )
  })

  wheelCenter.querySelector(".big").textContent = target.name
  wheelCenter.querySelector(".sm").textContent = `${target.provider.name} · ${target.meta}`
  wheelCenter.querySelector(".go").textContent = `切换到 ${target.model}`
}

buildWheel()
highlightWheel("OpenAI", "GPT-5")

// 03 磁贴墙：悬浮磁贴显示详情
const detail = document.getElementById("tileDetail")
document.querySelectorAll(".s3 .card").forEach((card) => {
  card.addEventListener("mouseenter", () => {
    const name = card.querySelector(".nm").textContent
    const meta = card.querySelector(".meta").textContent
    detail.querySelector(".nm").textContent = name
    detail.querySelectorAll(".meta")[0].textContent = meta
    detail.classList.add("show")
  })
  card.addEventListener("mouseleave", () => detail.classList.remove("show"))
})

// 05 分步向导
const wizardSteps = [
  {
    title: "选择供应商",
    desc: "先确定从哪一家拿模型，能力与价格差异都来自这里",
    cards: [
      ["solid-emerald", "O", "OpenAI", "2 个模型 · 含思考"],
      ["solid-orange", "A", "Anthropic", "1 个模型 · 含视觉"],
      ["solid-blue", "G", "Google", "1 个模型 · 超长上下文"],
    ],
  },
  {
    title: "选择模型",
    desc: "同一供应商下的模型，可以横向对比上下文与价格",
    cards: [
      ["solid-emerald", "GPT", "GPT-5", "128k · $1.25/10M"],
      ["solid-emerald", "m", "GPT-5 mini", "128k · $0.25/2M"],
      ["solid-emerald", "o4", "o4", "200k · $2.5/10M"],
    ],
  },
  {
    title: "思考强度",
    desc: "强度越高越贵越慢，中途切换会让上下文缓存失效",
    cards: [
      ["solid-emerald", "低", "低", "适合简单任务"],
      ["solid-emerald", "中", "中", "默认推荐"],
      ["solid-emerald", "高", "高", "复杂推理，最贵"],
    ],
  },
]

let wizardIndex = 0
const wizardBody = document.getElementById("wizBody")
const wizardNext = document.getElementById("wizNext")
const wizardBack = document.getElementById("wizBack")

function renderWizard() {
  const step = wizardSteps[wizardIndex]
  wizardBody.innerHTML = `
    <h3>${step.title}</h3>
    <p>${step.desc}</p>
    <div class="wgrid">
      ${step.cards
        .map(
          (card, index) => `
        <div class="wcard ${index === 0 ? "on" : ""}">
          <span class="logo ${card[0]}">${card[1]}</span>
          <div class="nm">${card[2]}</div>
          <div class="sub">${card[3]}</div>
        </div>`
        )
        .join("")}
    </div>`
  document.querySelectorAll(".s5 .step").forEach((item, index) => {
    item.classList.toggle("on", index === wizardIndex)
    item.classList.toggle("done", index < wizardIndex)
  })
  wizardNext.textContent =
    wizardIndex === wizardSteps.length - 1 ? "完成" : "下一步 →"
  wizardBack.textContent = wizardIndex === 0 ? "取消" : "上一步"
}

wizardNext.addEventListener("click", () => {
  wizardIndex = Math.min(wizardSteps.length - 1, wizardIndex + 1)
  renderWizard()
})
wizardBack.addEventListener("click", () => {
  wizardIndex = Math.max(0, wizardIndex - 1)
  renderWizard()
})
renderWizard()
