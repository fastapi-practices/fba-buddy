/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

const INK = "#2D2D2D"
const PURPLE = "#6C3FF5"
const PEACH = "#FF9B6B"
const SUN = "#E8D754"
const FOLLOW = 0.18

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}

function useBlink() {
  const [blinking, setBlinking] = useState(false)
  useEffect(() => {
    let timeout = 0
    const schedule = () => {
      timeout = window.setTimeout(
        () => {
          setBlinking(true)
          window.setTimeout(() => {
            setBlinking(false)
            schedule()
          }, 140)
        },
        Math.random() * 4000 + 3000,
      )
    }
    schedule()
    return () => window.clearTimeout(timeout)
  }, [])
  return blinking
}

function EyeBall({
  size,
  pupilSize,
  blinking,
  pupilRef,
}: {
  size: number
  pupilSize: number
  blinking: boolean
  pupilRef: React.Ref<HTMLDivElement>
}) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: "white",
        transform: blinking ? "scaleY(0.12)" : "scaleY(1)",
        transformOrigin: "center",
        transition: "transform 120ms ease-in-out",
      }}
    >
      <div
        ref={pupilRef}
        className="rounded-full will-change-transform"
        style={{
          width: pupilSize,
          height: pupilSize,
          backgroundColor: INK,
        }}
      />
    </div>
  )
}

function Pupil({ size, pupilRef }: { size: number; pupilRef: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={pupilRef}
      className="rounded-full will-change-transform"
      style={{
        width: size,
        height: size,
        backgroundColor: INK,
      }}
    />
  )
}

type Motion = {
  skew: number
  tx: number
  faceX: number
  faceY: number
  pupilX: number
  pupilY: number
  mouthX: number
}

function createMotion(faceX: number, faceY: number): Motion {
  return { skew: 0, tx: 0, faceX, faceY, pupilX: 0, pupilY: 0, mouthX: faceX }
}

export function LoginCharacters({
  isTyping = false,
  showPassword = false,
  passwordLength = 0,
  className,
}: {
  isTyping?: boolean
  showPassword?: boolean
  passwordLength?: number
  className?: string
}) {
  const purpleBlink = useBlink()
  const blackBlink = useBlink()
  const [lookingAtEachOther, setLookingAtEachOther] = useState(false)
  const [peeking, setPeeking] = useState(false)

  const purpleBodyRef = useRef<HTMLDivElement>(null)
  const purpleFaceRef = useRef<HTMLDivElement>(null)
  const purplePupilARef = useRef<HTMLDivElement>(null)
  const purplePupilBRef = useRef<HTMLDivElement>(null)
  const blackBodyRef = useRef<HTMLDivElement>(null)
  const blackFaceRef = useRef<HTMLDivElement>(null)
  const blackPupilARef = useRef<HTMLDivElement>(null)
  const blackPupilBRef = useRef<HTMLDivElement>(null)
  const peachBodyRef = useRef<HTMLDivElement>(null)
  const peachFaceRef = useRef<HTMLDivElement>(null)
  const peachPupilARef = useRef<HTMLDivElement>(null)
  const peachPupilBRef = useRef<HTMLDivElement>(null)
  const sunBodyRef = useRef<HTMLDivElement>(null)
  const sunFaceRef = useRef<HTMLDivElement>(null)
  const sunPupilARef = useRef<HTMLDivElement>(null)
  const sunPupilBRef = useRef<HTMLDivElement>(null)
  const sunMouthRef = useRef<HTMLDivElement>(null)

  const mouseRef = useRef({ x: 0, y: 0, ready: false })
  const poseRef = useRef({
    isTyping,
    hidingPassword: passwordLength > 0 && !showPassword,
    watchingPassword: passwordLength > 0 && showPassword,
    lookingAtEachOther,
    peeking,
  })
  useLayoutEffect(() => {
    poseRef.current = {
      isTyping,
      hidingPassword: passwordLength > 0 && !showPassword,
      watchingPassword: passwordLength > 0 && showPassword,
      lookingAtEachOther,
      peeking,
    }
  })

  const motionRef = useRef({
    purple: createMotion(45, 40),
    black: createMotion(26, 32),
    peach: createMotion(82, 90),
    sun: createMotion(52, 40),
  })

  useEffect(() => {
    if (!isTyping) {
      setLookingAtEachOther(false)
      return
    }
    setLookingAtEachOther(true)
    const timer = window.setTimeout(() => setLookingAtEachOther(false), 800)
    return () => window.clearTimeout(timer)
  }, [isTyping])

  useEffect(() => {
    const watchingPassword = passwordLength > 0 && showPassword
    if (!watchingPassword) {
      setPeeking(false)
      return
    }
    let peekOff = 0
    const peekOn = window.setTimeout(() => {
      setPeeking(true)
      peekOff = window.setTimeout(() => setPeeking(false), 800)
    }, Math.random() * 3000 + 2000)
    return () => {
      window.clearTimeout(peekOn)
      window.clearTimeout(peekOff)
    }
  }, [passwordLength, showPassword])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY, ready: true }
    }
    window.addEventListener("mousemove", onMove, { passive: true })

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const amount = reduced ? 1 : FOLLOW
    let frame = 0

    const lean = (el: HTMLDivElement | null) => {
      const mouse = mouseRef.current
      if (!el || !mouse.ready) {
        return { faceX: 0, faceY: 0, skew: 0, pupilX: 0, pupilY: 0 }
      }
      const rect = el.getBoundingClientRect()
      const dx = mouse.x - (rect.left + rect.width / 2)
      const dy = mouse.y - (rect.top + rect.height / 3)
      const pupilDist = Math.min(Math.hypot(dx, dy), 5)
      const angle = Math.atan2(dy, dx)
      return {
        faceX: clamp(dx / 20, -15, 15),
        faceY: clamp(dy / 30, -10, 10),
        skew: clamp(-dx / 120, -6, 6),
        pupilX: Math.cos(angle) * pupilDist,
        pupilY: Math.sin(angle) * pupilDist,
      }
    }

    const writePupil = (el: HTMLDivElement | null, x: number, y: number) => {
      if (el) {
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    }

    const tick = () => {
      const pose = poseRef.current
      const purpleLean = lean(purpleBodyRef.current)
      const blackLean = lean(blackBodyRef.current)
      const peachLean = lean(peachBodyRef.current)
      const sunLean = lean(sunBodyRef.current)
      const motion = motionRef.current

      let purpleTarget: Motion
      if (pose.watchingPassword) {
        purpleTarget = {
          skew: 0,
          tx: 0,
          faceX: 20,
          faceY: 35,
          pupilX: pose.peeking ? 4 : -4,
          pupilY: pose.peeking ? 5 : -4,
          mouthX: 20,
        }
      } else if (pose.lookingAtEachOther) {
        purpleTarget = {
          skew: purpleLean.skew - 12,
          tx: 40,
          faceX: 55,
          faceY: 65,
          pupilX: 3,
          pupilY: 4,
          mouthX: 55,
        }
      } else if (pose.isTyping || pose.hidingPassword) {
        purpleTarget = {
          skew: purpleLean.skew - 12,
          tx: 40,
          faceX: 45 + purpleLean.faceX,
          faceY: 40 + purpleLean.faceY,
          pupilX: purpleLean.pupilX,
          pupilY: purpleLean.pupilY,
          mouthX: 45,
        }
      } else {
        purpleTarget = {
          skew: purpleLean.skew,
          tx: 0,
          faceX: 45 + purpleLean.faceX,
          faceY: 40 + purpleLean.faceY,
          pupilX: purpleLean.pupilX,
          pupilY: purpleLean.pupilY,
          mouthX: 45,
        }
      }

      let blackTarget: Motion
      if (pose.watchingPassword) {
        blackTarget = {
          skew: 0,
          tx: 0,
          faceX: 10,
          faceY: 28,
          pupilX: -4,
          pupilY: -4,
          mouthX: 10,
        }
      } else if (pose.lookingAtEachOther) {
        blackTarget = {
          skew: blackLean.skew * 1.5 + 10,
          tx: 20,
          faceX: 32,
          faceY: 12,
          pupilX: 0,
          pupilY: -4,
          mouthX: 32,
        }
      } else if (pose.isTyping || pose.hidingPassword) {
        blackTarget = {
          skew: blackLean.skew * 1.5,
          tx: 0,
          faceX: 26 + blackLean.faceX,
          faceY: 32 + blackLean.faceY,
          pupilX: blackLean.pupilX,
          pupilY: blackLean.pupilY,
          mouthX: 26,
        }
      } else {
        blackTarget = {
          skew: blackLean.skew,
          tx: 0,
          faceX: 26 + blackLean.faceX,
          faceY: 32 + blackLean.faceY,
          pupilX: blackLean.pupilX,
          pupilY: blackLean.pupilY,
          mouthX: 26,
        }
      }

      const peachTarget: Motion = pose.watchingPassword
        ? { skew: 0, tx: 0, faceX: 50, faceY: 85, pupilX: -5, pupilY: -4, mouthX: 50 }
        : {
            skew: peachLean.skew,
            tx: 0,
            faceX: 82 + peachLean.faceX,
            faceY: 90 + peachLean.faceY,
            pupilX: peachLean.pupilX,
            pupilY: peachLean.pupilY,
            mouthX: 82,
          }

      const sunTarget: Motion = pose.watchingPassword
        ? { skew: 0, tx: 0, faceX: 20, faceY: 35, pupilX: -5, pupilY: -4, mouthX: 10 }
        : {
            skew: sunLean.skew,
            tx: 0,
            faceX: 52 + sunLean.faceX,
            faceY: 40 + sunLean.faceY,
            pupilX: sunLean.pupilX,
            pupilY: sunLean.pupilY,
            mouthX: 40 + sunLean.faceX,
          }

      const step = (current: Motion, target: Motion) => {
        current.skew = lerp(current.skew, target.skew, amount)
        current.tx = lerp(current.tx, target.tx, amount)
        current.faceX = lerp(current.faceX, target.faceX, amount)
        current.faceY = lerp(current.faceY, target.faceY, amount)
        current.pupilX = lerp(current.pupilX, target.pupilX, amount)
        current.pupilY = lerp(current.pupilY, target.pupilY, amount)
        current.mouthX = lerp(current.mouthX, target.mouthX, amount)
      }

      step(motion.purple, purpleTarget)
      step(motion.black, blackTarget)
      step(motion.peach, peachTarget)
      step(motion.sun, sunTarget)

      if (purpleBodyRef.current) {
        purpleBodyRef.current.style.transform = `skewX(${motion.purple.skew}deg) translate3d(${motion.purple.tx}px, 0, 0)`
      }
      if (purpleFaceRef.current) {
        purpleFaceRef.current.style.transform = `translate3d(${motion.purple.faceX}px, ${motion.purple.faceY}px, 0)`
      }
      writePupil(purplePupilARef.current, motion.purple.pupilX, motion.purple.pupilY)
      writePupil(purplePupilBRef.current, motion.purple.pupilX, motion.purple.pupilY)

      if (blackBodyRef.current) {
        blackBodyRef.current.style.transform = `skewX(${motion.black.skew}deg) translate3d(${motion.black.tx}px, 0, 0)`
      }
      if (blackFaceRef.current) {
        blackFaceRef.current.style.transform = `translate3d(${motion.black.faceX}px, ${motion.black.faceY}px, 0)`
      }
      writePupil(blackPupilARef.current, motion.black.pupilX, motion.black.pupilY)
      writePupil(blackPupilBRef.current, motion.black.pupilX, motion.black.pupilY)

      if (peachBodyRef.current) {
        peachBodyRef.current.style.transform = `skewX(${motion.peach.skew}deg)`
      }
      if (peachFaceRef.current) {
        peachFaceRef.current.style.transform = `translate3d(${motion.peach.faceX}px, ${motion.peach.faceY}px, 0)`
      }
      writePupil(peachPupilARef.current, motion.peach.pupilX, motion.peach.pupilY)
      writePupil(peachPupilBRef.current, motion.peach.pupilX, motion.peach.pupilY)

      if (sunBodyRef.current) {
        sunBodyRef.current.style.transform = `skewX(${motion.sun.skew}deg)`
      }
      if (sunFaceRef.current) {
        sunFaceRef.current.style.transform = `translate3d(${motion.sun.faceX}px, ${motion.sun.faceY}px, 0)`
      }
      writePupil(sunPupilARef.current, motion.sun.pupilX, motion.sun.pupilY)
      writePupil(sunPupilBRef.current, motion.sun.pupilX, motion.sun.pupilY)
      if (sunMouthRef.current) {
        sunMouthRef.current.style.transform = `translate3d(${motion.sun.mouthX}px, 88px, 0)`
      }

      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const hidingPassword = passwordLength > 0 && !showPassword

  return (
    <div className={cn("relative h-[400px] w-[min(100%,550px)]", className)} aria-hidden>
      <div
        ref={purpleBodyRef}
        className="absolute bottom-0 left-[70px] w-[180px] rounded-t-[10px] will-change-transform"
        style={{
          height: isTyping || hidingPassword ? 440 : 400,
          backgroundColor: PURPLE,
          transformOrigin: "bottom center",
          transition: "height 500ms ease",
        }}
      >
        <div
          ref={purpleFaceRef}
          className="absolute top-0 left-0 flex gap-8 will-change-transform"
          style={{ transform: "translate3d(45px, 40px, 0)" }}
        >
          <EyeBall size={18} pupilSize={7} blinking={purpleBlink} pupilRef={purplePupilARef} />
          <EyeBall size={18} pupilSize={7} blinking={purpleBlink} pupilRef={purplePupilBRef} />
        </div>
      </div>

      <div
        ref={blackBodyRef}
        className="absolute bottom-0 left-[240px] h-[310px] w-[120px] rounded-t-lg will-change-transform"
        style={{
          backgroundColor: INK,
          transformOrigin: "bottom center",
        }}
      >
        <div
          ref={blackFaceRef}
          className="absolute top-0 left-0 flex gap-6 will-change-transform"
          style={{ transform: "translate3d(26px, 32px, 0)" }}
        >
          <EyeBall size={16} pupilSize={6} blinking={blackBlink} pupilRef={blackPupilARef} />
          <EyeBall size={16} pupilSize={6} blinking={blackBlink} pupilRef={blackPupilBRef} />
        </div>
      </div>

      <div
        ref={peachBodyRef}
        className="absolute bottom-0 left-0 h-[200px] w-[240px] rounded-t-full will-change-transform"
        style={{
          backgroundColor: PEACH,
          transformOrigin: "bottom center",
        }}
      >
        <div
          ref={peachFaceRef}
          className="absolute top-0 left-0 flex gap-8 will-change-transform"
          style={{ transform: "translate3d(82px, 90px, 0)" }}
        >
          <Pupil size={12} pupilRef={peachPupilARef} />
          <Pupil size={12} pupilRef={peachPupilBRef} />
        </div>
      </div>

      <div
        ref={sunBodyRef}
        className="absolute bottom-0 left-[310px] h-[230px] w-[140px] rounded-t-full will-change-transform"
        style={{
          backgroundColor: SUN,
          transformOrigin: "bottom center",
        }}
      >
        <div
          ref={sunFaceRef}
          className="absolute top-0 left-0 flex gap-6 will-change-transform"
          style={{ transform: "translate3d(52px, 40px, 0)" }}
        >
          <Pupil size={12} pupilRef={sunPupilARef} />
          <Pupil size={12} pupilRef={sunPupilBRef} />
        </div>
        <div
          ref={sunMouthRef}
          className="absolute top-0 left-0 h-[4px] w-20 rounded-full will-change-transform"
          style={{ backgroundColor: INK, transform: "translate3d(40px, 88px, 0)" }}
        />
      </div>
    </div>
  )
}
