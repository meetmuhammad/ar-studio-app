import { test, expect, pageAs, PREFIX } from './fixtures'
import { btn, createCustomer, removeCustomerAndDependants, rows, search, settle, uniquePhone, uniqueSuffix } from '../support/ui'

/** Measurements created from the customer page deep link, then edited. Cleaned up in afterAll. */
const sfx = uniqueSuffix()
const customer = { name: `${PREFIX} Measure Customer ${sfx}`, phone: uniquePhone() }
const setName = `${PREFIX} Set ${sfx}`
let customerUrl = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await createCustomer(page, customer.name, customer.phone)
  customerUrl = new URL(page.url()).pathname
  await close()
})

test.afterAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await removeCustomerAndDependants(page, customer.name, customer.phone)
  await close()
})

test('create from the customer page deep link, then edit', async ({ page }) => {
  await page.goto(customerUrl)
  await settle(page)
  await page.getByRole('link', { name: /New measurement/i }).or(page.getByRole('button', { name: /New measurement/i })).first().click()
  await expect(page).toHaveURL(/\/measurements\/create\?customer_id=/)
  // the customer is preselected from the link
  await expect(page.locator('.ant-select-selection-item').filter({ hasText: customer.name })).toBeVisible()

  await page.getByLabel('Measurement Set Name').fill(setName)
  await page.locator('input#chest').fill('40')
  await page.locator('input#waist').fill('34')
  await btn(page, 'Create Measurement').click()
  await expect(page).toHaveURL(/\/measurements\/show\//)
  await expect(page.getByText(setName).first()).toBeVisible()

  await page.goto('/measurements')
  await search(page, 'Customer name or phone', customer.phone)
  await expect(rows(page)).toHaveCount(1)
  await page.getByRole('link', { name: `Edit ${setName}` }).click()
  await expect(page).toHaveURL(/\/measurements\/edit\//)
  // readings are shown with one decimal place
  await expect(page.locator('input#chest')).toHaveValue(/^40(\.0)?$/)
  await page.locator('input#waist').fill('35')
  await btn(page, 'Update Measurement').click()
  await expect(page).toHaveURL(/\/measurements\/show\//)
  await expect(page.getByText('35').first()).toBeVisible()

  // the customer page lists the set
  await page.goto(customerUrl)
  await expect(page.getByText(setName).first()).toBeVisible()
})

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff see the set; delete is admin-only', async ({ page }) => {
    await page.goto('/measurements')
    await search(page, 'Customer name or phone', customer.phone)
    await expect(page.getByRole('link', { name: `View ${setName}` })).toBeVisible()
    await expect(page.getByRole('button', { name: `Delete ${setName}` })).toBeDisabled()
  })
})
