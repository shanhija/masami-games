import { useFrame } from '@react-three/fiber'
import { useState, type ReactNode } from 'react'

/**
 * One child per item in a sim list, keyed by id in `render`, so each keeps its own
 * animation. The sim adds and drops items without telling React, so the list is re-read
 * every frame and re-rendered only when it has changed.
 */
export function Synced<T extends { id: number }>({ list, render }: { list: () => T[]; render: (item: T) => ReactNode }) {
  const [shown, setShown] = useState<T[]>([])
  useFrame(() => {
    const live = list()
    if (live.length !== shown.length || live.some((o, i) => o !== shown[i])) setShown([...live])
  })
  return <>{shown.map(render)}</>
}
