export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface LogEntry {
  id: number
  time: string
  message: string
  level: LogLevel
}
