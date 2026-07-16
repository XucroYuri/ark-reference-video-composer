import { describe, expect, it } from 'vitest'
import router from '@/router/index'

describe('application scaffold', () => {
  it('registers the migration-compatible hash route', () => {
    const route = router.getRoutes().find((item) => item.name === 'VideoGeneration')
    expect(route?.path).toBe('/video-generation')
  })
})
