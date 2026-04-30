export interface Device {
  id: string;
  name: string;
  description: string;
  status: number;
  sort_order: number;
  created_at: string;
}

export interface Booking {
  id: string;
  device_id: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: number;
  canceled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string | null;
  nickname: string;
  avatar: string;
  role: number;
  ban_status: number;
  ban_until: string | null;
  created_at: string;
}

export interface Config {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: string;
}

export interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

export interface Slot {
  time: string;
  available: boolean;
  takenBy: string;
  isMy: boolean;
  maintenance: boolean;
}
