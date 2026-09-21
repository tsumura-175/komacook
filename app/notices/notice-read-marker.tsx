"use client";
import { useEffect } from "react";
import { markNoticeRead } from "./actions";
export function NoticeReadMarker({ noticeId, enabled }: { noticeId: string; enabled: boolean }) { useEffect(() => { if (enabled) void markNoticeRead(noticeId); }, [enabled, noticeId]); return null; }
