'use client'

import { useState } from 'react'
import { useCan, useCreate, useDelete, useInvalidate } from '@refinedev/core'
import { AutoComplete, Button, Empty, Flex, Popconfirm, Space, Tag, Tooltip, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { deleteNotificationsFor, errorMessage } from '@/lib/refine/notifications'
import { TagNameSchema, VENDORS, VENDOR_TAGS } from './constants'
import { useTagSuggestions } from './use-vendor-tags'

interface VendorTagsEditorProps {
  vendorId: string
  tags: { id: string; tag_name: string }[]
}

/**
 * A vendor's tags on its page: remove with confirmation, add by typing
 * (suggestions from tags already in use). Writes vendor_tags directly; RLS
 * allows admins on vendors of their businesses. Duplicate tags on one vendor
 * are refused with "Tag already exists for this vendor", as before.
 *
 * Accessible names: "Add tag" (input), "Add" (button), "Remove tag <name>".
 */
export function VendorTagsEditor({ vendorId, tags }: VendorTagsEditorProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const suggestions = useTagSuggestions()
  const { data: canAdd } = useCan({ resource: VENDOR_TAGS, action: 'create' })
  const { data: canRemove } = useCan({ resource: VENDOR_TAGS, action: 'delete' })
  const { mutateAsync: create, mutation: createState } = useCreate()
  const { mutate: remove } = useDelete()
  const invalidate = useInvalidate()

  const refresh = () => invalidate({ resource: VENDORS, invalidates: ['detail', 'list'], id: vendorId })

  const add = async () => {
    const parsed = TagNameSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid tag')
      return
    }
    if (tags.some((t) => t.tag_name.toLowerCase() === parsed.data.toLowerCase())) {
      setError('Tag already exists for this vendor')
      return
    }
    setError(null)
    try {
      await create({
        resource: VENDOR_TAGS,
        values: { vendor_id: vendorId, tag_name: parsed.data },
        successNotification: { message: 'Tag added', type: 'success' },
        errorNotification: (e) => ({ message: errorMessage(e, 'Failed to add tag'), type: 'error' }),
      })
      setValue('')
      await refresh()
    } catch {
      // The notification already explains the failure.
    }
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {tags.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No tags yet." style={{ margin: 0 }} />
      ) : (
        <Flex wrap gap={8}>
          {tags.map((tag) => (
            <Popconfirm
              key={tag.id}
              title={`Remove tag "${tag.tag_name}"?`}
              okText="Remove"
              okButtonProps={{ danger: true }}
              disabled={!canRemove?.can}
              onConfirm={() =>
                remove(
                  { resource: VENDOR_TAGS, id: tag.id, ...deleteNotificationsFor('Tag') },
                  { onSuccess: () => void refresh() }
                )
              }
            >
              <Tag
                closable={!!canRemove?.can}
                onClose={(e) => e.preventDefault()}
                closeIcon={<span aria-label={`Remove tag ${tag.tag_name}`}>×</span>}
                style={{ fontSize: 13, padding: '2px 8px', cursor: canRemove?.can ? 'pointer' : undefined }}
              >
                {tag.tag_name}
              </Tag>
            </Popconfirm>
          ))}
        </Flex>
      )}

      <Tooltip title={canAdd?.can === false ? canAdd.reason : undefined}>
        <Space.Compact style={{ width: '100%', maxWidth: 420 }}>
          <AutoComplete
            value={value}
            onChange={(v) => {
              setValue(v)
              setError(null)
            }}
            options={suggestions
              .filter((s) => !tags.some((t) => t.tag_name.toLowerCase() === s.toLowerCase()))
              .filter((s) => s.toLowerCase().includes(value.trim().toLowerCase()))
              .map((s) => ({ value: s }))}
            onSelect={(v: string) => setValue(v)}
            placeholder="Add a tag"
            aria-label="Add tag"
            status={error ? 'error' : undefined}
            disabled={canAdd?.can === false}
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
          <Button
            icon={<PlusOutlined />}
            onClick={() => void add()}
            loading={createState.isPending}
            disabled={canAdd?.can === false || !value.trim()}
          >
            Add
          </Button>
        </Space.Compact>
      </Tooltip>
      {error && (
        <Typography.Text type="danger" role="alert">
          {error}
        </Typography.Text>
      )}
    </Space>
  )
}
