import { useId } from 'react'

import type { Lang } from './lang'

/**
 * A language's flag, drawn here (emoji flags do not show on every system): Finland's blue
 * cross on white, and the United Kingdom's for English, each in its own proportions and with
 * a thin ink rim so the white of Finland's stands out on the sky.
 */
export function Flag({ lang, className }: { lang: Lang; className: string }) {
  const id = useId()
  if (lang === 'fi')
    return (
      <svg className={className} viewBox="0 0 18 11" aria-hidden="true">
        <rect width="18" height="11" fill="#fff" />
        <rect x="5" width="3" height="11" fill="#002f6c" />
        <rect y="4" width="18" height="3" fill="#002f6c" />
        <rect width="18" height="11" fill="none" stroke="#2a2f45" strokeWidth="0.4" />
      </svg>
    )
  return (
    <svg className={className} viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id={`${id}-flag`}>
        <rect width="60" height="30" />
      </clipPath>
      <clipPath id={`${id}-half`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath={`url(#${id}-flag)`}>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}-half)`} stroke="#c8102e" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
      </g>
      <rect width="60" height="30" fill="none" stroke="#2a2f45" strokeWidth="1.2" />
    </svg>
  )
}
