export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface PublicRecord {
  id: string;
  version: number;
  updated_at: string;
  data: JsonValue;
}

export interface ServiceRecord extends PublicRecord {
  catalog_id: string;
}

export interface HoursRecord extends PublicRecord {
  catalog_id: string;
}

export interface PrivateRecord {
  id: string;
  owner_id: string;
  updated_at: string;
  data: JsonValue;
}

export interface FavoriteRecord extends PrivateRecord {
  catalog_id: string;
}

export interface PendingAttachmentRecord extends PrivateRecord {
  entity_id: string;
  file: Blob;
}

export type OutboxStatus = 'pending' | 'processing' | 'failed' | 'completed';

export interface OutboxRecord {
  operation_id: string;
  owner_id: string;
  entity_id: string;
  action: string;
  payload: JsonValue;
  base_version: number | null;
  created_at: string;
  attempts: number;
  next_retry_at: string | null;
  status: OutboxStatus;
  last_error: string | null;
}

export interface SyncMetaRecord {
  key: string;
  owner_id: string;
  updated_at: string;
  value: JsonValue;
}

export interface PushBinding {
  device_id: string;
  owner_id: string;
  state: 'pending' | 'active';
}
export interface CallFailureDraft {
  id: string;
  owner_id: string;
  appointment_id: string;
  kind:
    | 'connection_failed'
    | 'reconnection_timeout'
    | 'authorization_lost'
    | 'device_failed';
  created_at: string;
}

export interface PreferenceRecord {
  id: string;
  owner_id: string;
  establishment_id: string;
  favorite: boolean;
  note: string;
  remote_revision: number;
  updated_at: string;
  pending: boolean;
  conflict: boolean;
}
export interface OfflineSessionRecord {
  owner_id: string;
  token_hash: string;
  expires_at: number;
  user: { id: string; email?: string; email_confirmed_at?: string };
}
export interface PublicSnapshot {
  key: string;
  saved_at: string;
  data: unknown;
}
