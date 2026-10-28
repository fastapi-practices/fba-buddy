import type { ReactNode } from "react";
import { SkyCanvas } from "./SkyCanvas.tsx";

type Feature = {
  title: string;
  body: string;
  icon: ReactNode;
  delay: string;
  extra?: ReactNode;
};

const features: Feature[] = [
  {
    title: "一个工作台，贯穿需求、执行与交付",
    body: "Chat 澄清目标，Work 组织任务，Coding 进入代码仓库；上下文、工具调用与验证记录留在同一处，团队不必在模型、终端与文档之间反复搬运信息",
    delay: "0ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 4v5h-5" />
      </svg>
    ),
  },
  {
    title: "每一次执行，都有清晰的边界与证据",
    body: "计划、工具调用、文件变更、审批节点与测试结果全程可查；关键操作可以暂停、确认或回溯，让速度始终处在团队可理解、可管理的范围内",
    delay: "60ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    extra: (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-busy" />
          执行中
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-done" />
          待审批
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-2 rounded-full bg-status-attention" />
          已交付
        </span>
      </div>
    ),
  },
  {
    title: "并行的，不只是对话，而是完整工作",
    body: "每项任务拥有独立的 Worktree 与分支；调研、实现、评审与修复可以同时推进，探索不会打断主线，成熟方案再从容进入主分支",
    delay: "120ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m7 15 3-3-3-3" />
        <path d="M12 15h5" />
      </svg>
    ),
  },
  {
    title: "先理解系统，再生成每一行代码",
    body: "Skills、llms.txt 与 AGENTS.md 将架构约定、模块边界和团队规范带入上下文；Agent 交付的不是一段孤立代码，而是能够融入现有系统的工程变更",
    delay: "180ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18" />
        <path d="M5 8h14" />
        <path d="M7 12h10" />
        <path d="M9 16h6" />
      </svg>
    ),
  },
  {
    title: "从原型验证，到生产演进",
    body: "RBAC、多租户、Celery、Redis、插件、对象存储与容器化能力由 FBA 工程底座承接；权限、任务、数据与部署边界从第一天就在，原型进入生产时无需推倒重来",
    delay: "240ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    ),
  },
  {
    title: "开源，让选择权留在团队",
    body: "从模型、知识库、Skills、MCP 到微信、企业微信、飞书、钉钉、QQ、Telegram、Discord 等渠道，均可按业务边界灵活接入；代码、数据与扩展方式由团队掌握，不被单一平台定义",
    delay: "300ms",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8" />
        <path d="M12 16v4" />
      </svg>
    ),
  },
];

/**
 * Feature cards — surface color / border / inset / hover / reveal delays match production marketing markup.
 * Section backdrop: inverted WebGL mist (not sky), height 72%, vertical soft mask.
 */
export function Features() {
  return (
    <section id="features" className="relative isolate scroll-mt-24 overflow-hidden">
      {/* Drifting mist wash behind the card grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 55%, transparent 72%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent, black 35%, black 55%, transparent 72%)",
        }}
      >
        <SkyCanvas mode="mist" className="absolute inset-x-0 top-0 h-[72%] w-full -scale-y-100" />
      </div>

      <div className="mx-auto w-full max-w-6xl px-6 pb-24 pt-10 sm:pb-32 sm:pt-14">
        <div
          data-reveal=""
          style={{ ["--reveal-delay" as string]: "0ms" }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            从需求到交付，每一步都经得起验证
          </h2>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              data-reveal=""
              style={{ ["--reveal-delay" as string]: f.delay }}
              className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-white/[0.08] bg-[oklch(0.17_0.005_285_/_0.92)] p-6 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] transition-colors hover:bg-[oklch(0.19_0.005_285_/_0.94)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-border/60 bg-foreground/[0.03] text-foreground/80">
                {f.icon}
              </span>
              <h3 className="text-xl font-semibold tracking-tight">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              {f.extra}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
