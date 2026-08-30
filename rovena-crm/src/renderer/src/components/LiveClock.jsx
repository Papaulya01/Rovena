import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/index.jsx'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function partsInZone(timeZone, offsetMs = 0) {
  const base = new Date(Date.now() + offsetMs)
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short'
    })
    const parts = {}
    for (const p of dtf.formatToParts(base)) parts[p.type] = p.value
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: parts.hour === '24' ? 0 : Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
      weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : base.getDay()
    }
  } catch {
    return {
      year: base.getFullYear(),
      month: base.getMonth() + 1,
      day: base.getDate(),
      hour: base.getHours(),
      minute: base.getMinutes(),
      second: base.getSeconds(),
      weekdayIndex: base.getDay()
    }
  }
}

/** Живые часы с датой — используют часовой пояс/формат/ручную поправку из региональных настроек заведения. */
export default function LiveClock({ timezone = 'Asia/Tashkent', timeFormat = '24h', offsetMs = 0, className = '' }) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => partsInZone(timezone, offsetMs))

  useEffect(() => {
    setNow(partsInZone(timezone, offsetMs))
    const interval = setInterval(() => setNow(partsInZone(timezone, offsetMs)), 1000)
    return () => clearInterval(interval)
  }, [timezone, offsetMs])

  let hour = now.hour
  let suffix = ''
  if (timeFormat === '12h') {
    suffix = hour >= 12 ? ' PM' : ' AM'
    hour = hour % 12
    if (hour === 0) hour = 12
  }

  const weekdays = t('common2.weekdaysFull')
  const months = t('employees.months')
  const timeStr = `${pad2(hour)}:${pad2(now.minute)}:${pad2(now.second)}${suffix}`
  const dateStr = `${weekdays[now.weekdayIndex]}, ${now.day} ${months[now.month - 1]} ${now.year}`

  return (
    <div className={`live-clock ${className}`}>
      <span className="live-clock-time">{timeStr}</span>
      <span className="live-clock-date">{dateStr}</span>
    </div>
  )
}
