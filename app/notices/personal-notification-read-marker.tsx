"use client";

import { useEffect } from "react";
import { markPersonalNotificationRead } from "./actions";

export function PersonalNotificationReadMarker({ notificationId }: { notificationId: string }) {
  useEffect(() => { void markPersonalNotificationRead(notificationId); }, [notificationId]);
  return null;
}
