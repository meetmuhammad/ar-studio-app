/**
 * Notification builders for Refine mutations, so every module shows the same
 * wording ("<Entity> created successfully", the error message from the data
 * provider, etc.) through the antd notification provider.
 */

export const errorMessage = (error: unknown, fallback: string): string => {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : undefined
  return typeof message === 'string' && message ? message : fallback
}

/** Create / edit notifications for one entity (e.g. "Customer"). */
export const saveNotifications = (entity: string, action: 'create' | 'edit') => ({
  successNotification: () => ({
    message: `${entity} ${action === 'edit' ? 'updated' : 'created'} successfully`,
    type: 'success' as const,
  }),
  errorNotification: (error?: unknown) => ({
    message: errorMessage(error, `Failed to ${action === 'edit' ? 'update' : 'create'} ${entity.toLowerCase()}`),
    type: 'error' as const,
  }),
})

/** Delete notifications for one entity. */
export const deleteNotificationsFor = (entity: string) => ({
  successNotification: () => ({ message: `${entity} deleted successfully`, type: 'success' as const }),
  errorNotification: (error?: unknown) => ({
    message: errorMessage(error, `Failed to delete ${entity.toLowerCase()}`),
    type: 'error' as const,
  }),
})
