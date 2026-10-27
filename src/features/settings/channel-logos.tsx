import { useId, type ComponentProps, type ReactNode } from "react"

import { cn } from "@/lib/utils"
import type { ChannelType } from "@/lib/types"

type LogoSvgProps = ComponentProps<"svg">

function FeishuLogo(props: LogoSvgProps) {
  // 使用飞书官网 LarkLogoFilled 的品牌轮廓
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        fill="#00D6B9"
        d="M6.012 3.816a30.212 30.212 0 0 1 6.749 7.945l1.737-1.715a8.552 8.552 0 0 1 2.88-1.86 13.194 13.194 0 0 0-2.367-4.528.686.686 0 0 0-.538-.258H6.161a.235.235 0 0 0-.149.416Z"
      />
      <path
        fill="#1742B9"
        d="M10.834 14.802a29.79 29.79 0 0 0 3.914 1.354c2.381.644 4.642-.318 5.757-2.45l1.35-2.69A8.22 8.22 0 0 1 23 9.195a7.312 7.312 0 0 0-2.544-.451 7.33 7.33 0 0 0-5.162 2.109l-2.063 2.038a14.591 14.591 0 0 1-2.397 1.911Z"
      />
      <path
        fill="#3370FF"
        d="M1 10.057c0-.207.247-.313.397-.169 3.656 3.534 8.04 6.007 13.06 7.36 1.188.321 2.368.302 3.441-.013a13.25 13.25 0 0 1-9.241 3.737c-2.629 0-5.167-.763-7.347-2.212a.682.682 0 0 1-.305-.574L1 10.056Z"
      />
    </svg>
  )
}

function WechatLogo(props: LogoSvgProps) {
  return (
    <svg viewBox="0 0 24 24" fill="#07C160" aria-hidden="true" {...props}>
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  )
}

function WecomLogo(props: LogoSvgProps) {
  // 使用企业微信官网 HeaderLogoMobile.svg 的图标部分
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path
        fill="#0082EF"
        d="M13.053 3.1c7.033 0 12.754 4.954 12.754 11.084 0 .225-.01.446-.021.667l-.01.136-.102-.09a2.554 2.554 0 00-2.532-.504l-.091.03v-.451c-.16-4.558-4.573-8.24-10-8.24-1.13 0-2.217.16-3.232.454l-.43.133C5.673 7.564 3.05 10.641 3.05 14.221c0 2.52 1.3 4.788 3.365 6.348l.094.082a.9.9 0 01.263.666l-.012.124-.351 1.996a.172.172 0 00.254.178l2.293-1.323.085-.042c.2-.088.424-.1.633-.037l.4.115a11.53 11.53 0 002.98.385 11.59 11.59 0 003.437-.518l.073-.021.012.076a2.57 2.57 0 001.63 1.956l.166.064-.167.063c-1.575.606-3.32.942-5.151.942a14.48 14.48 0 01-3.792-.5l-3.79 1.848a.96.96 0 01-1.374-.963l.345-3.292C1.9 20.338.3 17.425.3 14.188.3 8.053 6.018 3.1 13.054 3.1z"
      />
      <path
        fill="#2DBC00"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25.29 15.505c.315.315.493.715.533 1.13h.003a4.591 4.591 0 001.42 2.798l.024.024a.467.467 0 01-.009.648.459.459 0 01-.648.01l-.024-.025c-.03-.036-.064-.07-.094-.103a4.628 4.628 0 00-2.686-1.32 1.876 1.876 0 01-1.148-.533 1.853 1.853 0 010-2.626 1.854 1.854 0 012.626 0l.003-.003z"
      />
      <path
        fill="#0082EF"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M30.275 23.01a1.836 1.836 0 01-1.13.533h-.003a4.625 4.625 0 00-2.792 1.423l-.025.024a.467.467 0 01-.648-.009.459.459 0 01-.009-.648l.024-.024c.037-.03.07-.064.103-.094a4.63 4.63 0 001.32-2.686 1.877 1.877 0 01.533-1.148 1.854 1.854 0 012.627 0 1.853 1.853 0 010 2.626v.003z"
      />
      <path
        fill="#FB6500"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M22.773 27.995a1.836 1.836 0 01-.533-1.13h-.003a4.592 4.592 0 00-1.324-2.707.994.994 0 00-.097-.091l-.024-.024a.467.467 0 01.01-.648.459.459 0 01.647-.01l.025.025c.03.036.063.07.093.103a4.629 4.629 0 002.687 1.32 1.877 1.877 0 011.148.533 1.853 1.853 0 010 2.626 1.853 1.853 0 01-2.626 0l-.003.003z"
      />
      <path
        fill="#FC0"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.785 20.493a1.835 1.835 0 011.13-.533h.002a4.624 4.624 0 002.702-1.327c.033-.033.067-.066.09-.096l.025-.025a.467.467 0 01.648.01c.182.181.185.46.01.648l-.025.024c-.036.03-.07.063-.103.094a4.629 4.629 0 00-1.32 2.686 1.877 1.877 0 01-.533 1.148 1.853 1.853 0 01-2.626 0 1.853 1.853 0 010-2.626v-.003z"
      />
    </svg>
  )
}

function DingtalkLogo(props: LogoSvgProps) {
  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true" {...props}>
      <circle cx="512" cy="512" r="512" fill="#3299E6" />
      <path
        fill="#172A3A"
        transform="translate(102.4 102.4) scale(.8)"
        d="M573.7 252.5C422.5 197.4 201.3 96.7 201.3 96.7c-15.7-4.1-17.9 11.1-17.9 11.1c-5 61.1 33.6 160.5 53.6 182.8c19.9 22.3 319.1 113.7 319.1 113.7S326 357.9 270.5 341.9c-55.6-16-37.9 17.8-37.9 17.8c11.4 61.7 64.9 131.8 107.2 138.4c42.2 6.6 220.1 4 220.1 4s-35.5 4.1-93.2 11.9c-42.7 5.8-97 12.5-111.1 17.8c-33.1 12.5 24 62.6 24 62.6c84.7 76.8 129.7 50.5 129.7 50.5c33.3-10.7 61.4-18.5 85.2-24.2L565 743.1h84.6L603 928l205.3-271.9H700.8l22.3-38.7c.3.5.4.8.4.8S799.8 496.1 829 433.8l.6-1h-.1c5-10.8 8.6-19.7 10-25.8c17-71.3-114.5-99.4-265.8-154.5"
      />
    </svg>
  )
}

function QqLogo(props: LogoSvgProps) {
  // QQ 官网 qq-logo.png 原样内嵌，避免运行时请求远程资源
  return (
    <svg viewBox="0 0 62 62" aria-hidden="true" {...props}>
      <image
        width="62"
        height="62"
        href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD4AAAA+CAMAAABEH1h2AAABOFBMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAD/qgAAAAAAAAAAAAAAAAAAAAAAAAD/qwA6JQAAAAD/qgAAAAAAAAD/AAr/AAb/qgD6pADWigDDfgAAAACDVQD/qgD/qgD/AAf/qQD/AAb/AAmrAAn/AAZuRwD/AAmwAAz/AAP/qwDEAAz/qwD/qwAAAAD/////AAb/qgAgICDf39+AgIDv7++/v7//3+QQEBDmlACgoKBAQEDGAAn/naxgYGDFfwCvr68RCwCQkJAwMDDnAAoyAAZiQABBKwBwcHD/LFZQUFBTAwshCwIRAAL1nwAxIADPz8+2AApvAAn3AAiTYACEVQD/tsD/jJ3/WHP/RGT/BkaVAAmFAAnWAAhDAAfWigC0dACkagBzSgBSNQD/e4//aoJ/f39fX191Ljj/ACNyaO4HAAAALHRSTlMAvyDf72Cf34AQQDBwryCjULqQfxXv79fX18+/kIBoWEDf37+/n5CQj0AwEMawQLgAAALaSURBVEjHzZbXWuJAGIbFhC6uuq69bW/fQEIwAZeOioDYe3fr/d/BkhlGWJKZxPXE9yhPwpu/zDD5h54p0ZHQnAJACUyMRR8rxwLoJzT8GHmYyv/7gqAKJ4pf/yVcUeN+7Sf4cQhRot7rpYCiZYiu0atfBimDkfCduk4I0U37PaRDGoyY15KBkSM2mwCy9oVhghLw0ENgpDsRtWIRgEH0jE4q/sIrYGSJAeQyAGjiO1vwE34MPLqtV2w9kzNI0cihS9Qrd177T2TLtk5rByfoI3du2SuXZ53nhOR952g6MfK8i1k8oHiVztFMMEwNHHnxEXBK94e311bKxirc3G2UwIl7d+6wkBqksO7duwAo7ZQL22CMeOpYt5zR22BEZDpnvfBP5NsNwFtX0KN5f1C4trYt6+aANo4zIY0uRx79TaMmd1u1vQ9CeyXZ4XL3Yu+q1hrwmrXG3vlutfP81aRIf5/sY796ucaoVvf7HywJ7MmkL94K9KWkP1bc9dc+9Y+u9mdfrrB5oWbjfG3fQ63uXly13LZ9VIVN7ffxiZv35+z0x3GjJTwvg2BsklWufGMcHa2uEkoFjKh4w5Z7Ohlki29c8TGXleh54Wkf5HpRom+ii2NUSKBLRqKnITpyVH+6IPsYOEU/ujqgj8BX60THdaJPJ99P6vX6Wf3UfeFUl+M6QO+xbSMmR9tGTzxn5yJ07bckuknLDji/lADm2EtMsb3Dmj6sOlrPpsYEWzkR5W7VMYeuqHG+fGmhXuEbLjI4ogXjD98J05DlHmI/H3MfhmXh8zy4/Dtj6q52lv1VZdCuouKWvq4JRhPn5s8ZAluaeq98bTD/jE/76+Js064/rfeHpl1rzyyPyuXRcXsWomOMmS/qzC3TrV467Dya+iR7wfJUdxLhw4SmaaCU+LwSlvjTKY5118YDpY2D7RRnUax/WRgPh1OM8PTs/IsO7+ZnevfC4wujQ8+Gv2sec3AKXOACAAAAAElFTkSuQmCC"
      />
    </svg>
  )
}

function TelegramLogo(props: LogoSvgProps) {
  /* 渐变 id 用 useId 生成，避免同页多实例互相覆盖 */
  const gradientId = useId()
  return (
    <svg viewBox="0 0 240 240" aria-hidden="true" {...props}>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1="120"
          y1="240"
          x2="120"
          y2="0"
        >
          <stop offset="0" stopColor="#1d93d2" />
          <stop offset="1" stopColor="#38b0e3" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r="120" fill={`url(#${gradientId})`} />
      <path
        fill="#c8daea"
        d="M81.229,128.772l14.237,39.406s1.78,3.687,3.686,3.687,30.255-29.492,30.255-29.492l31.525-60.89L81.737,118.6Z"
      />
      <path
        fill="#a9c6d8"
        d="M100.106,138.878l-2.733,29.046s-1.144,8.9,7.754,0,17.415-15.763,17.415-15.763"
      />
      <path
        fill="#fff"
        d="M81.486,130.178,52.2,120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229,2.1-2.2,6.489-4.523,120.106-45.36,120.106-45.36s3.208-1.081,5.1-.362a2.766,2.766,0,0,1,1.885,2.055,9.357,9.357,0,0,1,.254,2.585c-.009.752-.1,1.449-.169,2.542-.692,11.165-21.4,94.493-21.4,94.493s-1.239,4.876-5.678,5.043A8.13,8.13,0,0,1,146.1,172.5c-8.711-7.493-38.819-27.727-45.472-32.177a1.27,1.27,0,0,1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6,53.821-51.492c.108-.379-.3-.566-.848-.4-3.482,1.281-63.844,39.4-70.506,43.607A3.21,3.21,0,0,1,81.486,130.178Z"
      />
    </svg>
  )
}

function DiscordLogo(props: LogoSvgProps) {
  return (
    <svg viewBox="0 0 256 199" aria-hidden="true" {...props}>
      <path
        fill="#5865F2"
        d="M216.856 16.597A208.502 208.502 0 0 0 164.042 0c-2.275 4.113-4.933 9.645-6.766 14.046-19.692-2.961-39.203-2.961-58.533 0-1.832-4.4-4.55-9.933-6.846-14.046a207.809 207.809 0 0 0-52.855 16.638C5.618 67.147-3.443 116.4 1.087 164.956c22.169 16.555 43.653 26.612 64.775 33.193A161.094 161.094 0 0 0 79.735 175.3a136.413 136.413 0 0 1-21.846-10.632 108.636 108.636 0 0 0 5.356-4.237c42.122 19.702 87.89 19.702 129.51 0a131.66 131.66 0 0 0 5.355 4.237 136.07 136.07 0 0 1-21.886 10.653c4.006 8.021 8.638 15.67 13.873 22.848 21.142-6.58 42.646-16.637 64.815-33.213 5.316-56.288-9.081-105.09-38.056-148.36zM85.474 135.095c-12.645 0-23.015-11.805-23.015-26.18s10.149-26.2 23.015-26.2c12.867 0 23.236 11.804 23.015 26.2.02 14.375-10.148 26.18-23.015 26.18zm85.051 0c-12.645 0-23.014-11.805-23.014-26.18s10.148-26.2 23.014-26.2c12.867 0 23.236 11.804 23.015 26.2 0 14.375-10.148 26.18-23.015 26.18z"
      />
    </svg>
  )
}

const CHANNEL_LOGOS: Record<ChannelType, (props: LogoSvgProps) => ReactNode> = {
  feishu: FeishuLogo,
  wechat: WechatLogo,
  wecom: WecomLogo,
  dingtalk: DingtalkLogo,
  qq: QqLogo,
  telegram: TelegramLogo,
  discord: DiscordLogo,
}

export function ChannelLogo({
  type,
  className,
}: {
  type: ChannelType
  className?: string
}) {
  const Logo = CHANNEL_LOGOS[type]
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center",
        className
      )}
    >
      <Logo className="size-full" />
    </div>
  )
}
