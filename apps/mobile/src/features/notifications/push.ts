/**
 * Push registration stub (design §11). Nothing calls this in this run and it adds no dependency.
 * TODO(Phase 7): expo-notifications + FCM, then POST /me/devices with the token.
 */
export async function registerForPushNotifications(): Promise<{ status: 'unsupported' }> {
  return { status: 'unsupported' };
}
