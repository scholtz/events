import { renderToString } from 'vue/server-renderer'
import { createApp } from './main'

export async function render(url: string) {
  const { app, router } = createApp()

  // Set the router to the desired URL before rendering
  await router.push(url)
  await router.isReady()

  // Passing SSR context object which will be available via useSSRContext()
  // @vite-ignore
  const ctx = {}
  const html = await renderToString(app, ctx)

  return { html }
}
