import { Glass } from "./Glass.tsx";

const DOWNLOAD_HREF =
  "https://github.com/fastapi-practices/fba-buddy/releases/latest";

/** Product screenshot — raw capture only, no fake window chrome. */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_28px_56px_-18px_rgba(0,0,0,0.58)] ring-1 ring-inset ring-white/[0.05]">
      <img
        src={src}
        alt={alt}
        className="block h-auto w-full object-cover object-top"
        decoding="async"
      />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[42rem] bg-[radial-gradient(50%_50%_at_50%_30%,oklch(0.65_0_0/0.16),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10 text-center sm:pt-14">
        <h1 className="animate-rise text-balance text-[2.6rem] font-semibold leading-[1.08] tracking-tight sm:text-[3.25rem] lg:text-6xl">
          让智能，在真实的工程里发生
        </h1>
        <p className="animate-rise mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
          FbaBuddy 是基于 FBA 构建的企业级开源 AI Agent 工作台——它将需求理解、任务执行、代码变更与验证交付连接成一条清晰的工作流，让 AI 不止给出答案，更以可评审、可验证的方式进入真实工程
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DOWNLOAD_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2.5 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground shadow-lg shadow-black/20 transition-transform hover:-translate-y-0.5 active:translate-y-0"
          >
            下载桌面端
          </a>
          <Glass
            as="a"
            intensity="cta"
            href="#features"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-white/15 px-6 text-[15px] font-medium text-foreground/90 transition-transform hover:-translate-y-0.5"
          >
            探索产品能力
          </Glass>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl px-6 pt-2 pb-12">
        <div className="relative">
          <div className="group relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-16 -top-10 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(60%_60%_at_50%_0%,oklch(0.7_0_0/0.14),transparent_70%)] blur-2xl"
            />
            <Shot
              src="/fbabuddy-focus.png"
              alt="FbaBuddy 桌面工作台，包含侧栏、对话与输入框"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto mt-2 flex max-w-4xl flex-col items-center gap-5 px-6 pb-16">
        <span className="text-sm font-medium text-muted-foreground">
          从对话到代码，从执行到交付
        </span>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-foreground">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-muted-foreground">FBA</span>
            企业级工程底座
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-muted-foreground">BYOK</span>
            多模型灵活接入
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-muted-foreground">open</span>
            本地优先 · 开源可控
          </span>
        </div>
      </div>
    </section>
  );
}
