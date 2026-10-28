import { Glass } from "./Glass.tsx";

const DOWNLOAD_HREF =
  "https://github.com/fastapi-practices/fba-buddy/releases/latest";
const REPO_HREF = "https://github.com/fastapi-practices/fba-buddy";

export function Download() {
  return (
    <section className="relative px-6 py-24 sm:py-32">
      <div
        data-reveal=""
        style={{ ["--reveal-delay" as string]: "0ms" }}
        className="mx-auto max-w-3xl text-center"
      >
        <h2 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          让 AI 成为团队共同的工作方式
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          在 Windows、macOS 与 Linux 上连接你的模型、项目与团队；BYOK、本地优先、开源可控，也可以从源码出发，构建真正属于你的企业级 Agent 工作台
        </p>
      </div>
      <div
        data-reveal=""
        style={{ ["--reveal-delay" as string]: "120ms" }}
        id="download"
        className="scroll-mt-24 mt-10 text-center"
      >
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            下载桌面端
          </a>
          <Glass
            as="a"
            intensity="cta"
            href={REPO_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 px-6 text-[15px] font-medium text-foreground/90 transition-transform hover:-translate-y-0.5"
          >
            浏览开源代码
          </Glass>
        </div>
        <p className="mt-5 text-sm text-muted-foreground/70">
          AGPL-3.0 开源 · Windows · macOS · Linux
        </p>
      </div>
    </section>
  );
}
