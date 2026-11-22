'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from '@refinedev/antd'
import { useNotification, type HttpError } from '@refinedev/core'
import { Col, Form, Input, Row, Select } from 'antd'
import { ContactsOutlined, FileTextOutlined, ShopOutlined } from '@ant-design/icons'
import { zodRule } from '@/lib/refine/zod-rule'
import { errorMessage, saveNotifications } from '@/lib/refine/notifications'
import { EnterToSubmit, FormSection, Sections } from '@/components/refine/page-parts'
import { CategorySelect } from './category-select'
import { useSyncVendorTags, useTagSuggestions } from './use-vendor-tags'
import { UNCATEGORIZED_ID, VENDORS, VENDOR_SELECT, VendorSchema, type VendorRow } from './constants'

export interface VendorFormValues {
  name: string
  category_id?: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  /** Not a column: written to vendor_tags after the vendor is saved. */
  tags?: string[]
}

const shape = VendorSchema.shape

/**
 * Vendor create / edit form state. Saves the vendor through the data provider
 * (business-scoped, admin-only by RLS), then its tags, then opens the
 * vendor's page.
 */
export function useVendorForm(action: 'create' | 'edit', id?: string) {
  const router = useRouter()
  const { open } = useNotification()
  const syncTags = useSyncVendorTags()

  const form = useForm<VendorRow, HttpError, VendorFormValues>({
    resource: VENDORS,
    action,
    id,
    redirect: false,
    meta: { select: VENDOR_SELECT },
    ...saveNotifications('Vendor', action),
  })
  const record = form.query?.data?.data

  // Tags are not a column: fill the field from the loaded vendor.
  const antdForm = form.formProps.form
  useEffect(() => {
    if (record) antdForm?.setFieldValue('tags', (record.vendor_tags ?? []).map((t) => t.tag_name))
  }, [record, antdForm])

  const onFinish = async (values: VendorFormValues) => {
    const { tags, ...vendor } = values
    const saved = await form.onFinish(vendor).catch(() => undefined)
    const vendorId = (saved && 'data' in saved ? (saved.data as VendorRow | undefined)?.id : undefined) ?? id
    if (!saved || !vendorId) return
    try {
      await syncTags(vendorId, tags, record?.vendor_tags)
    } catch (error) {
      open?.({ type: 'error', message: `Vendor saved, but its tags could not be updated: ${errorMessage(error, 'unknown error')}` })
    }
    router.push(`/vendors/show/${vendorId}`)
  }

  return { ...form, record, onFinish }
}

/**
 * Vendor fields in card sections. Name, category and description as the
 * previous vendor form; contact details are
 * the optional columns /api/vendors accepts; tags are free text.
 */
export function VendorFormFields({ autoFocus = true }: { autoFocus?: boolean }) {
  const suggestions = useTagSuggestions()
  return (
    <Sections>
      <FormSection icon={<ShopOutlined />} title="Vendor">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Vendor Name" name="name" required rules={[zodRule(shape.name)]}>
              <Input placeholder="Enter vendor name" autoFocus={autoFocus} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Category" name="category_id" extra="Every vendor has one category; Uncategorized by default.">
              <CategorySelect />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item label="Tags" name="tags" extra="Free-text labels. Type and press Enter to add one.">
              <Select
                mode="tags"
                tokenSeparators={[',']}
                placeholder="e.g. fabric, embroidery"
                options={suggestions.map((name) => ({ label: name, value: name }))}
                aria-label="Tags"
              />
            </Form.Item>
          </Col>
        </Row>
      </FormSection>

      <FormSection icon={<ContactsOutlined />} title="Contact (optional)">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Contact Person" name="contact_person" rules={[zodRule(shape.contact_person)]}>
              <Input placeholder="Who you deal with" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Phone" name="phone" rules={[zodRule(shape.phone)]}>
              <Input placeholder="+92 300 1234567" inputMode="tel" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Email" name="email" rules={[zodRule(shape.email)]}>
              <Input placeholder="vendor@example.com" inputMode="email" autoComplete="off" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Address" name="address" rules={[zodRule(shape.address)]}>
              <Input placeholder="Street, city" autoComplete="off" />
            </Form.Item>
          </Col>
        </Row>
      </FormSection>

      <FormSection icon={<FileTextOutlined />} title="Description">
        <Form.Item label="Description (Optional)" name="notes" rules={[zodRule(shape.notes)]}>
          <Input.TextArea placeholder="Enter description or notes about this vendor" autoSize={{ minRows: 3, maxRows: 8 }} />
        </Form.Item>
      </FormSection>
      <EnterToSubmit />
    </Sections>
  )
}

export const NEW_VENDOR_DEFAULTS: Partial<VendorFormValues> = { category_id: UNCATEGORIZED_ID, tags: [] }
