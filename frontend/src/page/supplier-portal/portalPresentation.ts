export type PortalEvent = { event_type: string; title: string; description?: string; occurred_at: string };
export type MeetingSlot = { id: number; starts_at: string; ends_at?: string };
export type PortalOffering = { type: 'PRODUCT' | 'SERVICE'; name: string; category: string | null; description: string | null };
export type PortalApplication = {
  application_number: string; company_name: string; contact_person: string; email: string;
  business_type: string; supply_category: string; products_services: string | null; submitted_at: string;
  offerings?: PortalOffering[];
  status: 'PENDING' | 'UNDER_REVIEW' | 'NEEDS_REVISION' | 'QUALIFIED_FOR_MEETING' | 'MEETING_SCHEDULED' | 'MEETING_COMPLETED' | 'APPROVED' | 'REJECTED'; supplier_message?: string;
  revision_reason_codes?: string[]; alternative_schedule_requested?: boolean;
  attachments: { attachment_type: string; original_name: string; mime_type: string; file_size: number }[];
  history: PortalEvent[]; available_meeting_slots: MeetingSlot[];
  confirmed_meeting?: { id: number; starts_at: string; ends_at?: string; status: 'CONFIRMED' | 'COMPLETED' };
};

export const TIME_ZONE = 'Asia/Manila';
export const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, dateStyle: 'long' }).format(new Date(value));
const formatTime = (value: string) => new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, timeStyle: 'short' }).format(new Date(value));
export const formatDateTime = (value: string) => `${new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, dateStyle: 'medium' }).format(new Date(value))} · ${formatTime(value)}`;
export const formatMeetingTime = (meeting: MeetingSlot) => `${formatTime(meeting.starts_at)}${meeting.ends_at ? ` – ${formatTime(meeting.ends_at)}` : ''}`;
export const formatSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
