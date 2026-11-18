'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Checkbox,
  Divider,
  Dropdown,
  Empty,
  Grid,
  List as AntdList,
  Pagination,
  Popover,
  Result,
  Space,
  Table,
  Tooltip,
  Typography,
  type TableProps,
} from 'antd'
import type { ColumnType } from 'antd/es/table'
import { ColumnHeightOutlined, ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { CardWithTitle } from './card-with-title'

export type Density = 'large' | 'middle' | 'small'

/** A table column with a stable key and a plain-text title for the settings menu. */
export interface ResourceColumn<T> extends ColumnType<T> {
  key: string
  title: string
  /** Hidden until the user turns it on in column settings. */
  defaultHidden?: boolean
  /** Always shown (e.g. actions); not listed in column settings. */
  fixedVisible?: boolean
}

interface StoredSettings {
  density?: Density
  hidden?: string[]
}

const storageKey = (tableKey: string) => `ar-table:${tableKey}`

function readSettings(tableKey: string): StoredSettings {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(storageKey(tableKey)) ?? '{}') as StoredSettings
  } catch {
    return {}
  }
}

/** Density and visible columns for one table, persisted in localStorage. */
export function useTableSettings<T>(tableKey: string, columns: ResourceColumn<T>[]) {
  const defaults = useMemo(() => columns.filter((c) => c.defaultHidden).map((c) => c.key), [columns])
  const [density, setDensityState] = useState<Density>('middle')
  const [hidden, setHiddenState] = useState<string[]>(defaults)

  // Read after mount so server and first client render agree.
  useEffect(() => {
    const stored = readSettings(tableKey)
    if (stored.density) setDensityState(stored.density)
    if (stored.hidden) setHiddenState(stored.hidden)
  }, [tableKey])

  const persist = useCallback(
    (next: StoredSettings) => {
      try {
        localStorage.setItem(storageKey(tableKey), JSON.stringify({ ...readSettings(tableKey), ...next }))
      } catch {
        // Storage unavailable (private mode): settings just do not persist.
      }
    },
    [tableKey]
  )

  const setDensity = (value: Density) => {
    setDensityState(value)
    persist({ density: value })
  }
  const setHidden = (value: string[]) => {
    setHiddenState(value)
    persist({ hidden: value })
  }

  const visibleColumns = columns.filter((c) => c.fixedVisible || !hidden.includes(c.key))
  return { density, setDensity, hidden, setHidden, visibleColumns, defaults }
}

interface ToolbarProps<T> {
  columns: ResourceColumn<T>[]
  settings: ReturnType<typeof useTableSettings<T>>
  onRefresh: () => void
  refreshing?: boolean
}

/** Refresh, density and column settings (Ant Design Pro table toolbar). */
export function TableToolbar<T>({ columns, settings, onRefresh, refreshing }: ToolbarProps<T>) {
  const configurable = columns.filter((c) => !c.fixedVisible)
  const shown = configurable.filter((c) => !settings.hidden.includes(c.key)).map((c) => c.key)

  const panel = (
    <div style={{ minWidth: 200 }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Checkbox
          indeterminate={shown.length > 0 && shown.length < configurable.length}
          checked={shown.length === configurable.length}
          onChange={(e) => settings.setHidden(e.target.checked ? [] : configurable.map((c) => c.key))}
        >
          All columns
        </Checkbox>
        <Button type="link" size="small" onClick={() => settings.setHidden(settings.defaults)}>
          Reset
        </Button>
      </Space>
      <Divider style={{ margin: '8px 0' }} />
      <Checkbox.Group
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        value={shown}
        onChange={(values) =>
          settings.setHidden(configurable.map((c) => c.key).filter((key) => !(values as string[]).includes(key)))
        }
        options={configurable.map((c) => ({ label: c.title, value: c.key }))}
      />
    </div>
  )

  return (
    <Space size={4}>
      <Tooltip title="Refresh">
        <Button type="text" aria-label="Refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={onRefresh} />
      </Tooltip>
      <Dropdown
        trigger={['click']}
        menu={{
          selectable: true,
          selectedKeys: [settings.density],
          onClick: ({ key }) => settings.setDensity(key as Density),
          items: [
            { key: 'large', label: 'Default' },
            { key: 'middle', label: 'Medium' },
            { key: 'small', label: 'Compact' },
          ],
        }}
      >
        <Tooltip title="Density">
          <Button type="text" aria-label="Density" icon={<ColumnHeightOutlined />} />
        </Tooltip>
      </Dropdown>
      <Popover trigger="click" placement="bottomRight" title="Columns" content={panel}>
        <Tooltip title="Column settings">
          <Button type="text" aria-label="Column settings" icon={<SettingOutlined />} />
        </Tooltip>
      </Popover>
    </Space>
  )
}

interface ResourceTableProps<T> {
  tableKey: string
  icon: React.ReactNode
  title: React.ReactNode
  columns: ResourceColumn<T>[]
  tableProps: TableProps<T>
  rowKey: keyof T & string
  onRefresh: () => void
  refreshing?: boolean
  error?: { message?: string } | null
  /** Shown when the list is empty. */
  empty: { description: string; action?: React.ReactNode }
  /** Card body for one row on phones (the table collapses into a card list). */
  renderMobile?: (record: T) => React.ReactNode
  onRow?: TableProps<T>['onRow']
  /** Extra buttons left of the toolbar. */
  extra?: React.ReactNode
}

/**
 * Card + toolbar + table, in the Ant Design Pro list-page style: sticky
 * header, horizontal scroll, density and column settings persisted per table,
 * an Empty state with a call to action, and a card list on phones.
 */
export function ResourceTable<T extends object>({
  tableKey,
  icon,
  title,
  columns,
  tableProps,
  rowKey,
  onRefresh,
  refreshing,
  error,
  empty,
  renderMobile,
  onRow,
  extra,
}: ResourceTableProps<T>) {
  const screens = Grid.useBreakpoint()
  const settings = useTableSettings(tableKey, columns)
  const mobile = !!renderMobile && screens.md === false
  const pagination = tableProps.pagination || undefined
  const scrollX = settings.visibleColumns.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 160), 0)

  const emptyState = (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty.description}>
      {empty.action}
    </Empty>
  )

  return (
    <CardWithTitle
      icon={icon}
      title={title}
      action={
        <Space size={8}>
          {extra}
          {!mobile && <TableToolbar columns={columns} settings={settings} onRefresh={onRefresh} refreshing={refreshing} />}
          {mobile && (
            <Tooltip title="Refresh">
              <Button type="text" aria-label="Refresh" icon={<ReloadOutlined spin={refreshing} />} onClick={onRefresh} />
            </Tooltip>
          )}
        </Space>
      }
      styles={{ body: { padding: 0 } }}
    >
      {error ? (
        <Result
          status="warning"
          title="Couldn't load the list"
          subTitle={error.message}
          extra={<Button onClick={onRefresh}>Retry</Button>}
        />
      ) : mobile ? (
        <div style={{ padding: 12 }}>
          <AntdList<T>
            loading={!!tableProps.loading}
            dataSource={(tableProps.dataSource ?? []) as T[]}
            rowKey={rowKey}
            locale={{ emptyText: emptyState }}
            split={false}
            renderItem={(record) => <AntdList.Item style={{ padding: '6px 0' }}>{renderMobile!(record)}</AntdList.Item>}
          />
          {pagination && (pagination.total ?? 0) > 0 && (
            <Pagination
              {...pagination}
              size="small"
              showSizeChanger={false}
              style={{ marginTop: 12, textAlign: 'center' }}
              onChange={(page, pageSize) =>
                tableProps.onChange?.(
                  { ...pagination, current: page, pageSize },
                  {},
                  [],
                  { action: 'paginate', currentDataSource: [] }
                )
              }
            />
          )}
        </div>
      ) : (
        <Table<T>
          {...tableProps}
          rowKey={rowKey}
          size={settings.density}
          columns={settings.visibleColumns}
          sticky={{ offsetHeader: 64 }}
          scroll={{ x: scrollX }}
          onRow={onRow}
          locale={{ emptyText: emptyState }}
          pagination={
            pagination
              ? {
                  ...pagination,
                  showSizeChanger: true,
                  pageSizeOptions: [10, 20, 50, 100],
                  showTotal: (count, [from, to]) => (
                    <Typography.Text type="secondary">
                      {from}-{to} of {count}
                    </Typography.Text>
                  ),
                  style: { paddingInline: 16 },
                }
              : false
          }
        />
      )}
    </CardWithTitle>
  )
}
