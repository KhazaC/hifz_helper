import { useState, useEffect, useCallback } from 'react'

/**
 * Loads surah index and verse data from public JSON files.
 * Provides helper functions for surah names and max verse counts.
 */
export function useQuranData() {
  const [surahs, setSurahs] = useState([])
  const [verseData, setVerseData] = useState(null)

  useEffect(() => {
    fetch('/data/surah_index.json')
      .then(res => res.json())
      .then(data => {
        const surahList = Object.entries(data).map(([name, info]) => ({
          num: info.numSurah,
          name,
          numVerses: info.numVerses,
        }))
        surahList.sort((a, b) => a.num - b.num)
        setSurahs(surahList)
      })
    fetch('/data/verse_data.json')
      .then(res => res.json())
      .then(data => setVerseData(data))
  }, [])

  const getSurahName = useCallback(
    (surahNum) => {
      const surah = surahs.find(s => s.num === Number(surahNum))
      return surah ? surah.name : `Surah ${surahNum}`
    },
    [surahs]
  )

  const getMaxVerses = useCallback(
    (surahNum) => {
      const surah = surahs.find(s => s.num === Number(surahNum))
      return surah ? surah.numVerses : 999
    },
    [surahs]
  )

  return { surahs, verseData, getSurahName, getMaxVerses }
}
