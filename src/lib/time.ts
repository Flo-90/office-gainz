export function startOfDay(base: Date = new Date()): Date {
  const date = new Date(base)
  date.setHours(0, 0, 0, 0)
  return date
}

export function startOfWeek(base: Date = new Date()): Date {
  const date = startOfDay(base)
  const day = date.getDay()
  const diff = (day + 6) % 7
  date.setDate(date.getDate() - diff)
  return date
}
