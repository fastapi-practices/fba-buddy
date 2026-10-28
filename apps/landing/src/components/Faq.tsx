const faqs = [
  {
    q: "FbaBuddy 是什么？",
    a: "FbaBuddy 是基于 FBA 构建的企业级开源 AI Agent 工作台，它以 Chat、Work、Coding 三种模式串联需求澄清、任务执行、代码变更与验证交付，并通过项目上下文、Worktree 与审批记录，让 AI 的产出真正进入工程流程",
  },
  {
    q: "它与通用 AI 编程工具有什么不同？",
    a: "通用工具擅长生成代码，FbaBuddy 关注一项工作如何完成：从理解项目上下文、拆解任务，到隔离执行、审批验证与结果交付；主对话与侧栏任务还能并行推进，让探索和交付共享同一套工程上下文",
  },
  {
    q: "Chat、Work、Coding 分别适合什么场景？",
    a: "Chat 用于问答、梳理与决策；Work 用于多步骤调研、内容与任务协作；Coding 面向真实仓库中的代码修改、测试与交付；三者共用同一个输入框，方式随任务变化，上下文不必割裂",
  },
  {
    q: "并行任务如何保证主分支安全？",
    a: "每项任务使用独立 Worktree 与分支，探索不会直接影响主工作区；完成验证的方案再合入主线，未完成的尝试保留在独立边界内，既保留并行效率，也守住交付秩序",
  },
  {
    q: "FbaBuddy 如何处理模型与数据边界？",
    a: "模型密钥支持 BYOK，可接入多家模型服务、自建模型与内部接口；FBA 底座提供 RBAC、多租户与部署边界；FbaBuddy 坚持本地优先，但使用云端模型时仍需联网，数据流向取决于团队选择的供应商与部署方式",
  },
  {
    q: "能否接入现有知识与协作体系？",
    a: "可以，MCP、知识库、Skills 与插件能够承接内部能力、工程规范与专业知识；微信、企微、飞书、钉钉、QQ、Telegram、Discord 等渠道可让 Agent 进入团队已有的协作场景",
  },
  {
    q: "FbaBuddy 与 FBA 是什么关系？",
    a: "FBA 是面向生产的企业级 FastAPI 工程底座，FbaBuddy 是建立其上的 AI Agent 工作台；FbaBuddy 采用 AGPL-3.0，FBA 采用 MIT，团队既可直接使用桌面端，也可基于源码扩展、部署并参与共建",
  },
];

export function Faq() {
  return (
    <div id="faq" className="mx-auto w-full max-w-3xl scroll-mt-24 px-6 py-24 sm:py-32">
      <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }} className="text-center">
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          常见问题
        </h2>
      </div>
      <div className="mt-12">
        {faqs.map((item, i) => (
          <div key={item.q} data-reveal="" style={{ ["--reveal-delay" as string]: `${i * 60}ms` }}>
            <details className="group border-b border-border/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[17px] font-medium text-foreground/90 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                {item.q}
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <p className="-mt-1 pb-5 pr-8 text-[15px] leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
