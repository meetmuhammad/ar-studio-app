'use client'

import Link from 'next/link'
import { useCan, useDelete, type BaseKey } from '@refinedev/core'
import { Button, Popconfirm, Space, Tooltip } from 'antd'
import { DeleteOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons'

interface RowActionsProps {
  resource: string
  id: BaseKey
  /** Human name of the row, used in aria-labels and the confirm text. */
  label: string
  /** Route prefix, e.g. "/customers" -> /customers/show/:id, /customers/edit/:id. */
  basePath: string
  deleteNotifications?: {
    successNotification?: () => { message: string; type: 'success' }
    errorNotification?: (error?: unknown) => { message: string; type: 'error' }
  }
  /** Extra confirm detail, e.g. what deleting affects. */
  deleteDescription?: string
  size?: 'small' | 'middle'
}

/**
 * Inline View / Edit / Delete for a table row. Each action is checked with
 * the accessControlProvider; a denied action stays visible but disabled,
 * with the reason as its tooltip. Delete asks for confirmation.
 *
 * Accessible names: "View <label>", "Edit <label>", "Delete <label>".
 */
export function RowActions({
  resource,
  id,
  label,
  basePath,
  deleteNotifications,
  deleteDescription = 'This action cannot be undone.',
  size = 'small',
}: RowActionsProps) {
  const { data: canEdit } = useCan({ resource, action: 'edit', params: { id } })
  const { data: canDelete } = useCan({ resource, action: 'delete', params: { id } })
  const { mutate: remove, mutation } = useDelete()

  const editAllowed = canEdit?.can !== false
  const deleteAllowed = canDelete?.can === true

  return (
    <Space size={4} onClick={(e) => e.stopPropagation()}>
      <Tooltip title="View">
        <Link href={`${basePath}/show/${id}`} aria-label={`View ${label}`}>
          <Button size={size} icon={<EyeOutlined />} tabIndex={-1} />
        </Link>
      </Tooltip>
      <Tooltip title={editAllowed ? 'Edit' : canEdit?.reason}>
        {editAllowed ? (
          <Link href={`${basePath}/edit/${id}`} aria-label={`Edit ${label}`}>
            <Button size={size} icon={<EditOutlined />} tabIndex={-1} />
          </Link>
        ) : (
          <Button size={size} icon={<EditOutlined />} disabled aria-label={`Edit ${label}`} />
        )}
      </Tooltip>
      <Tooltip title={deleteAllowed ? 'Delete' : canDelete?.reason ?? 'Delete'}>
        <span>
          <Popconfirm
            title={`Delete ${label}?`}
            description={deleteDescription}
            okText="Delete"
            okButtonProps={{ danger: true, loading: mutation.isPending }}
            cancelText="Cancel"
            disabled={!deleteAllowed}
            onConfirm={() => remove({ resource, id, ...deleteNotifications })}
          >
            <Button
              size={size}
              danger
              icon={<DeleteOutlined />}
              disabled={!deleteAllowed}
              aria-label={`Delete ${label}`}
              style={deleteAllowed ? undefined : { pointerEvents: 'none' }}
            />
          </Popconfirm>
        </span>
      </Tooltip>
    </Space>
  )
}
