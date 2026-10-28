import { Glass } from "./Glass.tsx";
import { FbaMark } from "./FbaMark.tsx";
import { SkyCanvas } from "./SkyCanvas.tsx";

const footLink = "text-muted-foreground transition-colors duration-150 hover:text-foreground";

export function SiteFooter() {
  return (
    <footer className="relative mt-20 px-3 pb-3 sm:mt-28 sm:px-4 sm:pb-4">
      <div className="relative isolate mx-auto w-full max-w-6xl">
        {/* Soft mist rising under the footer glass */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl"
          style={{
            maskImage: "linear-gradient(to top, black, transparent 80%)",
            WebkitMaskImage: "linear-gradient(to top, black, transparent 80%)",
          }}
        >
          <SkyCanvas mode="mist" className="h-full w-full -scale-y-100" />
        </div>
        <Glass className="isolate relative rounded-2xl border border-border/50 shadow-lg shadow-black/10">
          <div className="flex flex-col gap-10 px-6 py-12 sm:flex-row sm:items-start sm:justify-between sm:gap-12 sm:py-14">
            <div className="max-w-xs">
              <div className="flex items-center gap-2.5">
                <FbaMark className="size-7" />
                <span className="text-[15px] font-semibold tracking-tight">FbaBuddy</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                让 AI 进入工程，让交付沉淀为能力——FbaBuddy 是基于 FBA
                构建的企业级开源 AI Agent 工作台
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-10 gap-y-8 text-sm md:grid-cols-3 md:gap-x-12">
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">产品</span>
                <a href="#features" className={footLink}>
                  能力
                </a>
                <a href="#why" className={footLink}>
                  为什么 FbaBuddy
                </a>
                <a href="#download" className={footLink}>
                  下载
                </a>
                <a href="#faq" className={footLink}>
                  FAQ
                </a>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">生态</span>
                <a
                  href="https://docs.fba.wu-clan.cc/fastapi_best_architecture_docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  FBA 文档
                </a>
                <a
                  href="https://github.com/fastapi-practices/fastapi_best_architecture"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  FBA 仓库
                </a>
                <a
                  href="https://github.com/fastapi-practices/fba-buddy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  GitHub
                </a>
              </div>
              <div className="flex flex-col gap-2.5">
                <span className="text-sm font-semibold text-foreground">开源许可</span>
                <a
                  href="https://github.com/fastapi-practices/fba-buddy/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  FbaBuddy · AGPL-3.0
                </a>
                <a
                  href="https://github.com/fastapi-practices/fastapi_best_architecture/blob/master/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={footLink}
                >
                  FBA · MIT
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-border/60">
            <div className="flex w-full flex-col gap-2 px-6 py-4 text-sm text-muted-foreground/60 sm:flex-row sm:items-center sm:justify-between sm:py-5">
              <span>© FbaBuddy · 企业级开源 AI Agent 工作台</span>
              <span className="inline-flex items-center gap-1.5">本地优先 · BYOK · 开源可控 · Win / macOS / Linux</span>
            </div>
          </div>
        </Glass>
      </div>
    </footer>
  );
}
