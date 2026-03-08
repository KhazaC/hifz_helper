import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * Loads surah index, verse data, and pre-built page map from public JSON files.
 * Provides helper functions for surah names and max verse counts.
 * Returns loading / error states for graceful UI handling.
 */
export function useQuranData() {
  const [surahs, setSurahs] = useState([])
  const [verseData, setVerseData] = useState(null)
  const [pageMap, setPageMap] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch('/data/surah_index.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load surah_index.json (${r.status})`)
        return r.json()
      }),
      fetch('/data/verse_data.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load verse_data.json (${r.status})`)
        return r.json()
      }),
      fetch('/data/pageMap.json').then(r => {
        if (!r.ok) throw new Error(`Failed to load pageMap.json (${r.status})`)
        return r.json()
      }),
    ])
      .then(([surahData, vData, pMap]) => {
        if (cancelled) return
        const surahList = Object.entries(surahData).map(([name, info]) => ({
          num: info.numSurah,
          name,
          numVerses: info.numVerses,
        }))
        surahList.sort((a, b) => a.num - b.num)
        setSurahs(surahList)
        setVerseData(vData)
        setPageMap(pMap)
        setIsLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        console.error('Failed to load Quran data:', err)
        setError(err.message)
        setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  // O(1) lookup maps built once when surahs change
  const surahByNum = useMemo(() => {
    const m = new Map()
    for (const s of surahs) m.set(s.num, s)
    return m
  }, [surahs])

  const getSurahName = useCallback(
    (surahNum) => {
      const surah = surahByNum.get(Number(surahNum))
      return surah ? surah.name : `Surah ${surahNum}`
    },
    [surahByNum]
  )

  const getMaxVerses = useCallback(
    (surahNum) => {
      const surah = surahByNum.get(Number(surahNum))
      return surah ? surah.numVerses : 999
    },
    [surahByNum]
  )

  return { surahs, verseData, pageMap, isLoading, error, getSurahName, getMaxVerses }
}
