/**
 * Standalone statement band — matches production marketing quote section:
 * max-w-4xl, py-28/36, text-3xl → sm:2.6rem, Instrument Serif italic accent.
 */
export function PurposeQuote() {
  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-28 text-center sm:py-36">
      <div data-reveal="" style={{ ["--reveal-delay" as string]: "0ms" }}>
        <p className="text-balance text-3xl font-medium leading-snug tracking-tight sm:text-[2.6rem] sm:leading-[1.15]">
          模型让速度发生{" "}
          <span className="font-display text-[1.1em] italic text-muted-foreground">
            工程，让速度成为资产
          </span>{" "}
          FbaBuddy 将需求、执行、审批与验证安放在同一条可追溯的链路上，让每一次 AI
          协作，都不止于当下的惊喜，更沉淀为团队可复用的软件生产力
        </p>
      </div>
    </section>
  );
}
