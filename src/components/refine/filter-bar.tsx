'use client'

import { Children, useState } from 'react'
import { Button, Card, Col, DatePicker, Form, Grid, Row, Space, type FormProps } from 'antd'
import { DownOutlined, ReloadOutlined, SearchOutlined, UpOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useColorMode } from '@/components/providers/color-mode-provider'
import { cardShadow } from '@/lib/refine/theme'

interface FilterBarProps<T> {
  /** `searchFormProps` from @refinedev/antd useTable. */
  formProps: FormProps<T>
  /** Form.Item fields, in display order. */
  children: React.ReactNode
  /** Fields visible while collapsed (default 2). */
  collapsedCount?: number
  /** Accessible name of the filter form. */
  label?: string
}

/**
 * Ant Design Pro style query form above a table: fields in a responsive grid,
 * Search / Reset, and an Expand / Collapse toggle when there are more fields
 * than fit. Filtering is server-side through useTable's onSearch, and with
 * syncWithLocation the values live in the URL.
 *
 * Name each field after the filter it produces (see the virtual filters in
 * src/lib/refine/data-provider.ts) so Refine can restore it from the URL.
 */
export function FilterBar<T>({ formProps, children, collapsedCount = 2, label = 'Filters' }: FilterBarProps<T>) {
  const { mode } = useColorMode()
  const screens = Grid.useBreakpoint()
  const [expanded, setExpanded] = useState(false)
  const fields = Children.toArray(children)
  const collapsible = fields.length > collapsedCount
  const visible = expanded || !collapsible ? fields : fields.slice(0, collapsedCount)

  const reset = () => {
    formProps.form?.resetFields()
    formProps.form?.submit()
  }

  return (
    <Card
      style={{ marginBottom: 16, boxShadow: cardShadow(mode) }}
      styles={{ body: { padding: screens.md ? '20px 24px 4px' : '16px 16px 4px' } }}
    >
      <Form {...formProps} layout="vertical" aria-label={label} role="search">
        <Row gutter={[16, 0]} align="bottom">
          {visible.map((field, i) => (
            <Col key={i} xs={24} sm={12} lg={8}>
              {field}
            </Col>
          ))}
          <Col xs={24} sm={12} lg={8} style={{ marginLeft: 'auto' }}>
            <Form.Item label={screens.lg ? ' ' : undefined} colon={false}>
              <Space wrap style={{ width: '100%', justifyContent: screens.lg ? 'flex-end' : 'flex-start' }}>
                <Button onClick={reset} icon={<ReloadOutlined />}>
                  Reset
                </Button>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                  Search
                </Button>
                {collapsible && (
                  <Button
                    type="link"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    icon={expanded ? <UpOutlined /> : <DownOutlined />}
                    iconPosition="end"
                  >
                    {expanded ? 'Collapse' : 'Expand'}
                  </Button>
                )}
              </Space>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  )
}

/**
 * Form.Item props for a date range filter. The form keeps the range as two
 * ISO strings (start of the first day, end of the last), so it survives the
 * URL round trip; the picker sees dayjs values.
 */
export const dateRangeItemProps = {
  getValueProps: (value?: [string, string]) => ({
    value: value && value[0] && value[1] ? [dayjs(value[0]), dayjs(value[1])] : undefined,
  }),
  normalize: (value?: [Dayjs | null, Dayjs | null] | null) =>
    value && value[0] && value[1] ? [value[0].startOf('day').toISOString(), value[1].endOf('day').toISOString()] : undefined,
}

/** Date range picker preset to the shared look. */
export function DateRangeFilter(props: React.ComponentProps<typeof DatePicker.RangePicker>) {
  return (
    <DatePicker.RangePicker
      allowEmpty={[false, false]}
      style={{ width: '100%' }}
      presets={[
        { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
        { label: 'Last 30 days', value: [dayjs().subtract(29, 'day'), dayjs()] },
        { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
        { label: 'This year', value: [dayjs().startOf('year'), dayjs()] },
      ]}
      {...props}
    />
  )
}
