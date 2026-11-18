import { test, expect, pageAs, PREFIX } from './fixtures'
import { MENU, btn, forbidden, menuLabels, removeCategory, removeVendor, rows, search, settle, uniqueSuffix } from '../support/ui'

/** Vendors (admin only): category drawer, tags, edit, delete; staff get a 403. Cleaned up in afterAll. */
const sfx = uniqueSuffix()
const vendor = `${PREFIX} Vendor ${sfx}`
const category = `${PREFIX} Cat ${sfx}`
const renamed = `${category} R`
const tags = [`e2e-${sfx}-a`, `e2e-${sfx}-b`]
let vendorShowPath = ''

test.describe.configure({ mode: 'serial' })

test.afterAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await removeVendor(page, vendor)
  for (const c of [category, renamed]) await removeCategory(page, c)
  await close()
})

test('categories drawer: add, rename, delete', async ({ page }) => {
  await page.goto('/vendors')
  await settle(page)
  await btn(page, 'Manage Categories').click()
  const drawer = page.locator('.ant-drawer-open')
  await drawer.getByLabel('New category name').fill(category)
  await btn(drawer, 'Add').click()
  await expect(drawer.getByText(category, { exact: true })).toBeVisible()

  await drawer.getByRole('button', { name: `Rename ${category}` }).click()
  await drawer.getByLabel(`New name for ${category}`).fill(renamed)
  await page.keyboard.press('Enter')
  await expect(drawer.getByText(renamed, { exact: true })).toBeVisible()

  await drawer.getByRole('button', { name: `Delete ${renamed}` }).click()
  await btn(page.locator('.ant-popover:visible'), 'Delete').click()
  await expect(drawer.getByText(renamed, { exact: true })).toHaveCount(0)
})

test('create a vendor with tags, find it, edit it, add a tag', async ({ page }) => {
  await page.goto('/vendors')
  await settle(page)
  await btn(page, 'Add Vendor').click()
  await expect(page).toHaveURL(/\/vendors\/create/)
  await page.getByLabel('Vendor Name').fill(vendor)
  const tagBox = page.getByRole('combobox', { name: 'Tags' })
  await tagBox.click()
  await tagBox.fill(tags[0])
  await page.keyboard.press('Enter')
  // Enter in the tags box adds a tag; it must not submit the form
  await expect(page).toHaveURL(/\/vendors\/create/)
  await btn(page, 'Create Vendor').click()
  await expect(page).not.toHaveURL(/\/vendors\/create/)

  await page.goto('/vendors')
  await search(page, 'Search vendors', vendor)
  await expect(rows(page)).toHaveCount(1)
  await page.getByRole('link', { name: `Edit ${vendor}` }).click()
  await page.getByLabel('Description (Optional)').fill(`edited ${sfx}`)
  await btn(page, 'Update Vendor').click()
  await expect(page).not.toHaveURL(/\/vendors\/edit/)

  await page.goto('/vendors')
  await search(page, 'Search vendors', vendor)
  await page.getByRole('link', { name: `View ${vendor}` }).click()
  await expect(page).toHaveURL(/\/vendors\/show\//)
  vendorShowPath = new URL(page.url()).pathname
  const content = page.locator('.ant-layout-content')
  await expect(content.getByText(`edited ${sfx}`)).toBeVisible()
  await expect(content.getByText(tags[0])).toBeVisible()

  await page.getByRole('combobox', { name: 'Add tag' }).fill(tags[1])
  await btn(page, 'Add').last().click()
  await expect(content.getByText(tags[1])).toBeVisible()
})

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff: no Vendors menu, 403 on the list and on a vendor URL', async ({ page }) => {
    await page.goto('/customers')
    await settle(page)
    expect(await menuLabels(page)).toEqual(MENU.staff)
    await page.goto('/vendors')
    await expect(forbidden(page)).toBeVisible()
    test.skip(!vendorShowPath, 'vendor was not created')
    await page.goto(vendorShowPath)
    await expect(forbidden(page)).toBeVisible()
  })
})

test('admin: delete the vendor', async ({ page }) => {
  await page.goto('/vendors')
  await search(page, 'Search vendors', vendor)
  await page.getByRole('button', { name: `Delete ${vendor}` }).click()
  await btn(page.locator('.ant-popover:visible'), 'Delete').click()
  await expect(rows(page)).toHaveCount(0)
})
