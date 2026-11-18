import { test as setup, expect } from '@playwright/test'
import { assertStagingTarget } from './guard'
import { STATE, creds, type Role } from './fixtures'
import { signIn } from '../support/ui'

/** Real UI sign-in per role; the session is saved as storage state for the specs. */
for (const role of ['admin', 'staff'] as Role[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    assertStagingTarget()
    const { email, password } = creds(role)
    await signIn(page, email, password)
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.context().storageState({ path: STATE[role] })
  })
}
