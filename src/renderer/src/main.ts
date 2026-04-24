import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installSettingsPersistence } from './stores/settingsStore'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
installSettingsPersistence()
app.mount('#app')
