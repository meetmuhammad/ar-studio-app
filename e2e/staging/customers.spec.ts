import { test, expect, pageAs, PREFIX } from './fixtures'
import { btn, createCustomer, removeCustomerAndDependants, rows, search, settle, uniquePhone, uniqueSuffix } from '../support/ui'

/** Customers CRUD and search, as admin and as staff. Every record is removed in afterAll. */
const sfx = uniqueSuffix()
const admin = { name: `${PREFIX} Customer ${sfx}`, phone: uniquePhone() }
const staff = { name: `${PREFIX} Staff Customer ${sfx}`, phone: uniquePhone() }

test.describe.configure({ mode: 'serial' })

test.afterAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  for (const c of [admin, staff]) await removeCustomerAndDependants(page, c.name, c.phone)
  await close()
})

test('admin: create, search by phone and name, edit, delete', async ({ page }) => {
  await createCustomer(page, admin.name, admin.phone)
  await expect(page.getByText(admin.name).first()).toBeVisible()

  await page.goto('/customers')
  await search(page, 'Name or phone', admin.phone)
  await expect(rows(page)).toHaveCount(1)
  await search(page, 'Name or phone', admin.name)
  await expect(page.getByRole('link', { name: `View ${admin.name}` })).toBeVisible()
  // filters live in the URL, so a reload keeps the result
  await page.reload()
  await settle(page)
  await expect(page.getByRole('link', { name: `View ${admin.name}` })).toBeVisible()

  await page.getByRole('link', { name: `Edit ${admin.name}` }).click()
  await expect(page).toHaveURL(/\/customers\/edit\//)
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(admin.name)
  admin.name = `${admin.name} edited`
  await page.getByLabel('Name', { exact: true }).fill(admin.name)
  await btn(page, 'Update Customer').click()
  await expect(page).toHaveURL(/\/customers\/show\//)
  await expect(page.getByText(admin.name).first()).toBeVisible()

  await page.goto('/customers')
  await search(page, 'Name or phone', admin.phone)
  await page.getByRole('button', { name: `Delete ${admin.name}` }).click()
  await btn(page.locator('.ant-popover:visible'), 'Delete').click()
  await expect(rows(page)).toHaveCount(0)
})

test('admin: an invalid phone is refused inline', async ({ page }) => {
  await page.goto('/customers/create')
  await page.getByLabel('Name', { exact: true }).fill(`${PREFIX} Invalid ${sfx}`)
  await page.getByLabel('Phone', { exact: true }).fill('0abc')
  await btn(page, 'Create Customer').click()
  await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
  await expect(page).toHaveURL(/\/customers\/create/)
})

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff: create and find a customer; delete is admin-only', async ({ page }) => {
    await createCustomer(page, staff.name, staff.phone)
    await page.goto('/customers')
    await search(page, 'Name or phone', staff.phone)
    await expect(page.getByRole('link', { name: `View ${staff.name}` })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete ${staff.name}` })).toBeDisabled()
  })
})
