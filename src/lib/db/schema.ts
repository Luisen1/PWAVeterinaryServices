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
