import { useEffect, useRef } from 'react'

/**
 * Debounces writing a value to a callback.
 * Fires immediately on first call, then debounces subsequent calls.
 *
 * @param {*} value - The value to watch
 * @param {function} callback - Called with (value) after debounce
 * @param {number} delay - Debounce delay in ms (default 300)
 */
export function useDebouncedWrite(value, callback, delay = 300) {
  const isFirstRun = useRef(true)

  useEffect(() => {
    // Skip debouncing the initial mount (value already in localStorage)
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }

    const timer = setTimeout(() => callback(value), delay)
    return () => clearTimeout(timer)
  }, [value, callback, delay])
}
