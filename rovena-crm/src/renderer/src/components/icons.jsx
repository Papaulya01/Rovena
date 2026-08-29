// Простые линейные иконки для сайдбара — SVG, наследуют цвет текста (currentColor),
// поэтому автоматически подхватывают состояния .nav-link (обычный/hover/active).

const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

export function IconVenue(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.2L4.3 3h11.4l1.3 5.2" />
      <path d="M3 8.2a2.2 2.2 0 0 0 4.4 0 2.2 2.2 0 0 0 4.4 0 2.2 2.2 0 0 0 4.4 0" />
      <path d="M4 8.2V17h12V8.2" />
      <path d="M8.2 17v-4.2h3.6V17" />
    </svg>
  )
}

export function IconEmployees(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="7.2" cy="6.5" r="2.6" />
      <path d="M2.3 16.5c0-2.9 2.2-5.2 4.9-5.2s4.9 2.3 4.9 5.2" />
      <circle cx="14" cy="7.5" r="2" />
      <path d="M12.8 11.6c2 .3 3.5 2.2 3.5 4.5" />
    </svg>
  )
}

export function IconDashboard(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.4" />
    </svg>
  )
}

export function IconTable(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="5" width="15" height="4" rx="1.2" />
      <path d="M4.5 9v7.2" />
      <path d="M15.5 9v7.2" />
    </svg>
  )
}

export function IconCalendar(props) {
  return (
    <svg {...base} {...props}>
      <rect x="2.5" y="3.8" width="15" height="13.7" rx="2" />
      <path d="M2.5 8h15" />
      <path d="M6.2 2v3.2" />
      <path d="M13.8 2v3.2" />
      <circle cx="6.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconBag(props) {
  return (
    <svg {...base} {...props}>
      <path d="M7 7V5.4a3 3 0 0 1 6 0V7" />
      <path d="M4.3 7h11.4l-.9 9.2a1.8 1.8 0 0 1-1.8 1.6H7a1.8 1.8 0 0 1-1.8-1.6L4.3 7z" />
      <path d="M7 9.6a3 3 0 0 0 6 0" />
    </svg>
  )
}

export function IconList(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="4" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
      <path d="M7.8 5.5h9.7" />
      <path d="M7.8 10h9.7" />
      <path d="M7.8 14.5h9.7" />
    </svg>
  )
}

export function IconWallet(props) {
  return (
    <svg {...base} {...props}>
      <path d="M2.8 6.2A2.2 2.2 0 0 1 5 4h9.5A2.5 2.5 0 0 1 17 6.5V6.2" />
      <rect x="2.5" y="6.2" width="15" height="10.8" rx="2.2" />
      <circle cx="13.2" cy="11.6" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconLink(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8.3 11.7 11.7 8.3" />
      <path d="M9 5.6l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5L13.4 10" />
      <path d="M11 14.4l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5L6.6 10" />
    </svg>
  )
}
