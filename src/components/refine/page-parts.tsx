'use client'

import { Card, Skeleton, Space } from 'antd'
import { CardWithTitle } from './card-with-title'

/**
 * Shared pieces for Refine <List>/<Create>/<Edit>/<Show> pages, so every
 * module has the same Ant Design Pro look: breadcrumb + title + subtitle +
 * actions in the header, and content made of cards on the gray page.
 */

/** `contentProps` for a page whose content is its own cards (no outer white box). */
export const transparentContent = { style: { background: 'transparent', boxShadow: 'none', padding: 0 } }

/** `headerProps` with a subtitle under the page title. */
export const withSubtitle = (subTitle: React.ReactNode) => ({ subTitle })

/** A titled card section of a form or detail page. */
export function FormSection({
  icon,
  title,
  extra,
  children,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <CardWithTitle icon={icon} title={title} action={extra} styles={{ body: { paddingBottom: 4 } }}>
      {children}
    </CardWithTitle>
  )
}

/** Vertical stack of sections with the standard gap. */
export function Sections({ children }: { children: React.ReactNode }) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {children}
    </Space>
  )
}

/**
 * Lets Enter in any field submit the form. Refine's Save button sits outside
 * the <form> element, so the form needs its own (invisible) submit button.
 */
export function EnterToSubmit() {
  return <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
}

/** Placeholder while a show/edit record loads. */
export function PageSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <Sections>
      {Array.from({ length: sections }, (_, i) => (
        <Card key={i}>
          <Skeleton active title paragraph={{ rows: 4 }} />
        </Card>
      ))}
    </Sections>
  )
}
