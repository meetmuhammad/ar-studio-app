import { test, expect, pageAs, PREFIX } from './fixtures'
import { btn, createCustomer, pickOption, removeCustomerAndDependants, rows, search, settle, uniquePhone, uniqueSuffix } from '../support/ui'

/**
 * Orders and payments: Steps create with an item and an advance, record / edit /
 * delete a payment, staff limits, order delete. Cleaned up in afterAll.
 */
const sfx = uniqueSuffix()
const customer = { name: `${PREFIX} Order Customer ${sfx}`, phone: uniquePhone() }
let orderPath = ''
let orderNumber = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await createCustomer(page, customer.name, customer.phone)
  await close()
})

test.afterAll(async ({ browser }) => {
  const { page, close } = await pageAs(browser, 'admin')
  await removeCustomerAndDependants(page, customer.name, customer.phone)
  await close()
})

const content = (page: import('@playwright/test').Page) => page.locator('.ant-layout-content')

test('create an order through the three steps', async ({ page }) => {
  await page.goto('/orders/create')
  await settle(page)
  await pickOption(page, 'Customer', customer.name)
  await btn(page, 'Add Item').click()
  // Next validates the step: an empty item description is refused
  await btn(page, 'Next').click()
  await expect(page.locator('.ant-form-item-explain-error').first()).toBeVisible()
  await page.getByLabel('Item 1 description').fill(`${PREFIX} sherwani ${sfx}`)
  await btn(page, 'Next').click()
  await btn(page, 'Next').click()
  await page.getByLabel('Total').fill('20000')
  await page.getByLabel('Advance').fill('5000')
  await expect(page.getByLabel('Balance (Calculated)')).toHaveValue(/15,?000/)
  await btn(page, 'Create Order').click()

  await expect(page).toHaveURL(/\/orders\/show\//)
  orderPath = new URL(page.url()).pathname
  const heading = await page.getByRole('heading', { name: /^Order / }).first().innerText()
  orderNumber = heading.replace(/^Order\s+/, '').trim()
  expect(orderNumber).toMatch(/\S+-\d+/)
  await expect(content(page).getByText(`${PREFIX} sherwani ${sfx}`)).toBeVisible()
  await expect(content(page).getByText(/20,000/).first()).toBeVisible()
  await expect(content(page).getByText(/5,000/).first()).toBeVisible()

  // the list finds it by order number
  await page.goto('/orders')
  await search(page, 'Order number or customer', orderNumber)
  await expect(page.getByRole('link', { name: `View order ${orderNumber}` })).toBeVisible()
})

test('record, edit and delete a payment', async ({ page }) => {
  test.skip(!orderPath, 'order was not created')
  await page.goto(orderPath)
  await settle(page)
  await btn(page, 'Record Payment').click()
  const modal = page.locator('.ant-modal:visible')
  await modal.getByLabel('Amount').fill('3000')
  await btn(modal, 'Add Payment').click()
  await expect(modal).toBeHidden()
  await expect(page.getByText('Payments (1)')).toBeVisible()
  await expect(content(page).getByText(/8,000/).first()).toBeVisible() // paid = advance 5,000 + 3,000

  await page.getByRole('button', { name: /^Edit payment of / }).first().click()
  const edit = page.locator('.ant-modal:visible')
  await edit.getByLabel('Amount').fill('2500')
  await btn(edit, 'Update Payment').click()
  await expect(edit).toBeHidden()
  await expect(content(page).getByText(/7,500/).first()).toBeVisible()

  await page.getByRole('button', { name: /^Delete payment of / }).first().click()
  await btn(page.locator('.ant-popover:visible'), 'Delete').click()
  await expect(page.getByText('Payments (0)')).toBeVisible()
})

test.describe('staff', () => {
  test.use({ role: 'staff' })

  test('staff see the order; payments and delete are admin-only', async ({ page }) => {
    test.skip(!orderPath, 'order was not created')
    await page.goto(orderPath)
    await settle(page)
    await expect(page.getByRole('heading', { name: `Order ${orderNumber}` })).toBeVisible()
    await expect(btn(page, 'Record Payment')).toBeDisabled()
    await expect(btn(page, 'Delete').first()).toBeDisabled()
  })
})

test('admin: delete the order', async ({ page }) => {
  test.skip(!orderPath, 'order was not created')
  await page.goto(orderPath)
  await settle(page)
  await btn(page, 'Delete').first().click()
  await btn(page.locator('.ant-popover:visible'), 'Delete').click()
  await expect(page).toHaveURL(/\/orders(\?|$)/)
  await search(page, 'Order number or customer', orderNumber)
  await expect(rows(page)).toHaveCount(0)
})
