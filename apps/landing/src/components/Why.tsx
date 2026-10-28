export function Why() {
  return (
    <section id="why" className="relative scroll-mt-24 overflow-hidden">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-24 sm:py-32 lg:grid-cols-2 lg:gap-16">
        <div>
          <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
            <p className="font-mono text-xs tracking-wide text-muted-foreground/70">为什么是 FbaBuddy</p>
            <p className="mt-4 text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
              速度可以来自模型，交付必须来自工程
            </p>
          </div>
          <div
            data-reveal=""
            style={{ ["--reveal-delay" as string]: "80ms" }}
            className="mt-8 space-y-6 text-lg leading-relaxed text-muted-foreground"
          >
            <p>
              生成代码正在变得容易，难的是让结果进入真实业务：理解既有边界、补齐上下文、审查风险、完成验证，再让它持续演进；缺少这条路径，AI 带来的往往只是局部提速，无法成为组织的交付能力
            </p>
            <p>
              FbaBuddy 以 FBA 为工程底座，把权限、租户、任务、数据与部署边界前置到 AI 工作流中；需求、执行、审批与验证被完整记录，个体的探索可以复用，团队的经验得以沉淀，个人效率由此成为可以继承的组织能力
            </p>
          </div>
        </div>

        <div data-reveal="" style={{ ["--reveal-delay" as string]: "120ms" }} className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-x-10 -top-8 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_0%,oklch(0.7_0_0/0.12),transparent_70%)] blur-2xl"
          />
          <div className="overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_28px_56px_-18px_rgba(0,0,0,0.58)] ring-1 ring-inset ring-white/[0.05]">
            <img
              src="/fbabuddy-config.png"
              alt="FbaBuddy 企业级 AI 配置与工程能力界面"
              className="block h-auto w-full object-cover object-top"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
