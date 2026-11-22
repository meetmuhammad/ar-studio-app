import { redirect } from 'next/navigation'

/** The vendor page moved to /vendors/show/[id]; old links keep working. */
export default async function VendorLegacyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/vendors/show/${encodeURIComponent(id)}`)
}
