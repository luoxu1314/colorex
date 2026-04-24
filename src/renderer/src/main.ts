import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installSettingsPersistence } from './stores/settingsStore'
import './styles/main.css'

const app = createApp(App)
app.use(createPinia())
installSettingsPersistence()
app.mount('#app')
