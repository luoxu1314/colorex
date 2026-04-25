import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installSettingsPersistence } from './stores/settingsStore'
import { installTheme } from './stores/uiStore'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/main.css'

// Apply the theme BEFORE mounting the Vue app so we never flash the wrong
// color scheme on first paint.
installTheme()

const app = createApp(App)
app.use(createPinia())
installSettingsPersistence()
app.mount('#app')
