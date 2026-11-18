'use client'

import { useState } from 'react'
import { useCan, useCreate, useDelete, useList, useUpdate, type HttpError } from '@refinedev/core'
import { Alert, Button, Drawer, Form, Grid, Input, Popconfirm, Space, Table, Tag, Tooltip, Typography } from 'antd'
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  InboxOutlined,
  PlusOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { zodRule } from '@/lib/refine/zod-rule'
import { errorMessage } from '@/lib/refine/notifications'
import { CategoryNameSchema, UNCATEGORIZED_ID, VENDOR_CATEGORIES, type CategoryRow } from './constants'

const PROTECTED_REASON = 'Uncategorized is the default category and cannot be archived or deleted.'

/**
 * "Accounting Categories": the shared list used to classify vendors
 * (vendor_categories has no business_id). Mirrors the previous categories
 * dialog and /api/vendor-categories/**:
 * - add / rename: trimmed, required, max 120, unique ignoring case
 *   ("A category with that name already exists");
 * - archive hides a category from pickers but keeps it on existing vendors
 *   and ledger entries; restore brings it back;
 * - delete only when nothing uses it. The database refuses deleting a used
 *   category (both foreign keys are ON DELETE RESTRICT), and the message
 *   suggests archiving instead;
 * - renaming does not rewrite past ledger entries (they keep their snapshot).
 * Writes go straight to the table (admin-only by RLS); nothing extra happens
 * in the API on rename or delete, so no API call is needed.
 * "Uncategorized" (fixed id, the default) cannot be archived or deleted here.
 */
export function ManageCategoriesDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const screens = Grid.useBreakpoint()
  const [addForm] = Form.useForm<{ name: string }>()
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const { data: canCreate } = useCan({ resource: VENDOR_CATEGORIES, action: 'create' })
  const { data: canEdit } = useCan({ resource: VENDOR_CATEGORIES, action: 'edit' })
  const { data: canDelete } = useCan({ resource: VENDOR_CATEGORIES, action: 'delete' })

  const { result, query } = useList<CategoryRow, HttpError>({
    resource: VENDOR_CATEGORIES,
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
    queryOptions: { enabled: open },
  })
  const { mutateAsync: create, mutation: createState } = useCreate<CategoryRow, HttpError>()
  const { mutateAsync: update, mutation: updateState } = useUpdate<CategoryRow, HttpError>()
  const { mutate: remove } = useDelete<CategoryRow, HttpError>()

  const add = async ({ name }: { name: string }) => {
    try {
      await create({
        resource: VENDOR_CATEGORIES,
        values: { name: name.trim() },
        successNotification: { message: 'Category created', type: 'success' },
        errorNotification: (e) => ({ message: errorMessage(e, 'Failed to create category'), type: 'error' }),
      })
      addForm.resetFields()
    } catch (e) {
      addForm.setFields([{ name: 'name', errors: [errorMessage(e, 'Failed to create category')] }])
    }
  }

  const saveRename = async () => {
    if (!editing) return
    const parsed = CategoryNameSchema.safeParse(editing.name)
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? 'Invalid name')
      return
    }
    try {
      await update({
        resource: VENDOR_CATEGORIES,
        id: editing.id,
        values: { name: parsed.data },
        successNotification: { message: 'Category renamed', type: 'success' },
        errorNotification: (e) => ({ message: errorMessage(e, 'Failed to rename category'), type: 'error' }),
      })
      setEditing(null)
      setEditError(null)
    } catch (e) {
      setEditError(errorMessage(e, 'Failed to rename category'))
    }
  }

  const setArchived = (c: CategoryRow, archived: boolean) =>
    update({
      resource: VENDOR_CATEGORIES,
      id: c.id,
      values: { archived_at: archived ? new Date().toISOString() : null },
      successNotification: { message: archived ? `${c.name} archived` : `${c.name} restored`, type: 'success' },
      errorNotification: (e) => ({ message: errorMessage(e, 'Failed to update category'), type: 'error' }),
    }).catch(() => undefined)

  const denied = (allowed?: { can: boolean; reason?: string }) => (allowed?.can === false ? allowed.reason : undefined)

  return (
    <Drawer
      title="Accounting Categories"
      open={open}
      onClose={onClose}
      width={screens.md ? 560 : '100%'}
      destroyOnClose
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          Used to classify vendors for accounting. Shared by every business. Renaming a category does not change how
          past ledger entries are recorded.
        </Typography.Paragraph>

        <Form form={addForm} layout="inline" onFinish={add} style={{ flexWrap: 'nowrap' }} disabled={canCreate?.can === false}>
          <Form.Item name="name" rules={[zodRule(CategoryNameSchema)]} style={{ flex: 1, marginInlineEnd: 8 }}>
            <Input placeholder="New category name" aria-label="New category name" maxLength={120} autoFocus />
          </Form.Item>
          <Form.Item style={{ marginInlineEnd: 0 }}>
            <Tooltip title={denied(canCreate)}>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={createState.isPending}>
                Add
              </Button>
            </Tooltip>
          </Form.Item>
        </Form>

        <Table<CategoryRow>
          rowKey="id"
          size="small"
          loading={query.isLoading}
          dataSource={result.data ?? []}
          pagination={false}
          scroll={{ y: 'calc(100vh - 320px)' }}
          locale={{ emptyText: 'No categories yet.' }}
          columns={[
            {
              key: 'name',
              title: 'Category',
              render: (_, c) =>
                editing?.id === c.id ? (
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      value={editing.name}
                      maxLength={120}
                      autoFocus
                      aria-label={`New name for ${c.name}`}
                      status={editError ? 'error' : undefined}
                      onChange={(e) => {
                        setEditing({ id: c.id, name: e.target.value })
                        setEditError(null)
                      }}
                      onPressEnter={() => void saveRename()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null)
                      }}
                    />
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      aria-label="Save"
                      loading={updateState.isPending}
                      onClick={() => void saveRename()}
                    />
                    <Button icon={<CloseOutlined />} aria-label="Cancel" onClick={() => setEditing(null)} />
                  </Space.Compact>
                ) : (
                  <Space size={6} wrap>
                    <Typography.Text delete={!!c.archived_at} type={c.archived_at ? 'secondary' : undefined}>
                      {c.name}
                    </Typography.Text>
                    {c.archived_at && <Tag>archived</Tag>}
                    {c.id === UNCATEGORIZED_ID && <Tag color="blue">default</Tag>}
                  </Space>
                ),
            },
            {
              key: 'actions',
              title: 'Actions',
              width: 140,
              align: 'right',
              render: (_, c) => {
                if (editing?.id === c.id) return null
                const isProtected = c.id === UNCATEGORIZED_ID
                return (
                  <Space size={4}>
                    <Tooltip title={denied(canEdit) ?? 'Rename'}>
                      <Button
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={`Rename ${c.name}`}
                        disabled={canEdit?.can === false}
                        onClick={() => {
                          setEditing({ id: c.id, name: c.name })
                          setEditError(null)
                        }}
                      />
                    </Tooltip>
                    <Tooltip title={isProtected ? PROTECTED_REASON : denied(canEdit) ?? (c.archived_at ? 'Restore' : 'Archive')}>
                      <Button
                        size="small"
                        icon={c.archived_at ? <UndoOutlined /> : <InboxOutlined />}
                        aria-label={c.archived_at ? `Restore ${c.name}` : `Archive ${c.name}`}
                        disabled={isProtected || canEdit?.can === false}
                        onClick={() => void setArchived(c, !c.archived_at)}
                      />
                    </Tooltip>
                    <Tooltip title={isProtected ? PROTECTED_REASON : denied(canDelete) ?? 'Delete'}>
                      <span>
                        <Popconfirm
                          title={`Delete category "${c.name}"?`}
                          description="Only a category nothing uses can be deleted; archive it otherwise."
                          okText="Delete"
                          okButtonProps={{ danger: true }}
                          disabled={isProtected || canDelete?.can === false}
                          onConfirm={() =>
                            remove({
                              resource: VENDOR_CATEGORIES,
                              id: c.id,
                              successNotification: { message: 'Category deleted', type: 'success' },
                              errorNotification: (e) => ({
                                message: errorMessage(e, 'Failed to delete category'),
                                type: 'error',
                              }),
                            })
                          }
                        >
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={`Delete ${c.name}`}
                            disabled={isProtected || canDelete?.can === false}
                          />
                        </Popconfirm>
                      </span>
                    </Tooltip>
                  </Space>
                )
              },
            },
          ]}
        />

        {editError && <Alert type="error" showIcon message={editError} role="alert" />}

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          A category that is in use cannot be deleted — archive it instead. Archived categories disappear from vendor
          pickers but stay readable on the entries they already classify.
        </Typography.Text>
      </Space>
    </Drawer>
  )
}
