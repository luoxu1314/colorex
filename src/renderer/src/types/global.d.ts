import type { ColorExchangeApi } from '../../../preload'

declare global {
  interface Window {
    colorExchange: ColorExchangeApi
  }
}

export {}
