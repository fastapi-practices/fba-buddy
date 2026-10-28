export function AlwaysRunning() {
  return (
    <section className="relative overflow-hidden px-6 py-24 sm:py-32">
      <div className="mx-auto grid w-full max-w-5xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
          <p className="font-mono text-xs tracking-wide text-muted-foreground/70">并行协作</p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            专注不必让路，协作可以并行
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            主工作区保留当前判断，侧栏对话同步推进调研、评审与验证；每项任务在独立
            Worktree 与分支中运行，探索不打断主线，成熟方案再从容合入——探索因此可以并行，
            交付依然有序
          </p>
        </div>
        <div data-reveal="" style={{ ["--reveal-delay" as string]: "100ms" }}>
          <div className="overflow-hidden rounded-2xl border border-white/[0.10] shadow-[0_28px_56px_-18px_rgba(0,0,0,0.58)] ring-1 ring-inset ring-white/[0.05]">
            <img
              src="/fbabuddy-split.png"
              alt="FbaBuddy 主工作区与侧栏对话并行工作"
              className="block h-auto w-full object-cover object-top"
              decoding="async"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
