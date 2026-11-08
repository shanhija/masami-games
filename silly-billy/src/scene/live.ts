import { useFrame } from '@react-three/fiber'
import { useState } from 'react'

/**
 * A value read off the world every frame, for the few things React draws (which room,
 * who is here, what a bubble says): the sim changes the world without telling React, so
 * the component looks each frame and renders again only when the value has changed.
 */
export function useLive<T>(read: () => T): T {
  const [value, setValue] = useState(read)
  useFrame(() => {
    const now = read()
    if (!Object.is(now, value)) setValue(() => now)
  })
  return value
}
