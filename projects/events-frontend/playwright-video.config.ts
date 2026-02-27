import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for video recording - extends main config
 * Follows Playwright documentation for mouse cursor visibility
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30000,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    /* Record traces for mouse movement visualization */
    trace: 'on',
    screenshot: 'only-on-failure',
    /* Record video for this specific run */
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    /* Full HD viewport for video recording */
    viewport: { width: 1920, height: 1080 },
    /* Slow down actions for video clarity */
    actionTimeout: 1000,
    navigationTimeout: 10000,
    /* Initialize mouse-helper for mouse cursor visibility */
    // Note: mouse-helper will be loaded manually in tests for proper timing
    launchOptions: {
      args: [
        '--window-size=1920,1080',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--force-gpu-rasterization',
        '--enable-hardware-overlays=single-fullscreen,single-on-top,underlay',
        '--use-gl=desktop',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-ipc-flooding-protection',
        // Additional flags for mouse cursor visibility in recordings
        '--force-show-cursor',
        '--enable-mouse-cursor-recording',
        '--disable-cursor-hiding',
        '--cursor-visibility=always',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        /* Run in headed mode for mouse cursor visibility (Playwright docs) */
        headless: true,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
