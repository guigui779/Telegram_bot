import { config } from './config';
import * as db from './db';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': config.apiKey,
};

async function getApiBaseUrls(): Promise<{ primary: string; backup: string }> {
  const primary = ((await db.getSetting('api_url')) || '').replace(/\/$/, '');
  const backup = ((await db.getSetting('api_url_backup')) || '').replace(/\/$/, '');
  return { primary, backup };
}

/** 获取所有接口地址（当前+所有备用） */
async function getAllApiUrls(): Promise<string[]> {
  const primary = ((await db.getSetting('api_url')) || '').replace(/\/$/, '');
  const backups = await db.getSettingsByPrefix('api_url_backup');
  const urls: string[] = [];
  if (primary) urls.push(primary);
  for (const b of backups) {
    const url = b.value.replace(/\/$/, '');
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

async function requestApi(path: string, init?: RequestInit): Promise<Response> {
  const { primary, backup } = await getApiBaseUrls();
  try {
    return await fetch(`${primary}${path}`, init);
  } catch (error) {
    if (!backup) throw error;
    return await fetch(`${backup}${path}`, init);
  }
}

/** 创建授权码（调用后端 POST /api/invite） */
export async function createInviteCode(ttlSeconds?: number): Promise<{ code: string } | null> {
  try {
    const res = await requestApi(`/api/invite`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ttlSeconds: ttlSeconds || 43200 }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { code: string };
  } catch {
    return null;
  }
}

/** 批量创建授权码 */
export async function createInviteCodes(count: number, ttlSeconds?: number): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const result = await createInviteCode(ttlSeconds);
    if (result) codes.push(result.code);
  }
  return codes;
}

/** 删除授权码 */
export async function deleteInviteCode(code: string): Promise<boolean> {
  try {
    const res = await requestApi(`/api/invite/${code}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 释放房间（POST /api/invite/release） */
export async function releaseRoom(code: string): Promise<boolean> {
  try {
    const res = await requestApi(`/api/invite/release`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 查询授权码信息 */
export async function getInviteInfo(code: string): Promise<any | null> {
  try {
    const res = await requestApi(`/api/invite/${code}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** 获取所有授权码 */
export async function getAllInvites(): Promise<any[]> {
  try {
    const res = await requestApi(`/api/invites`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as any[];
    return (data as any).invites || [];
  } catch {
    return [];
  }
}

/** 检查指定 URL 的健康状态 */
export async function checkUrlHealth(url: string, manual = false): Promise<boolean> {
  try {
    const baseUrl = url.replace(/\/$/, '');
    const endpoint = manual ? '/api/health/check' : '/api/health';
    const init: RequestInit = manual ? { method: 'POST', headers } : { headers };
    const res = await fetch(`${baseUrl}${endpoint}`, init);
    return res.ok;
  } catch {
    return false;
  }
}

export async function listRooms(): Promise<any[]> {
  try {
    const res = await requestApi(`/api/rooms`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function createRoom(roomName: string, emptyTimeout?: number, maxParticipants?: number): Promise<any | null> {
  try {
    const res = await requestApi(`/api/rooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ roomName, emptyTimeout, maxParticipants }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteRoom(roomName: string): Promise<boolean> {
  try {
    const res = await requestApi(`/api/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getHealth(): Promise<any | null> {
  try {
    const res = await requestApi(`/api/health`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function manualHealthCheck(): Promise<any | null> {
  try {
    const res = await requestApi(`/api/health/check`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function startRecording(roomName: string, outputFile?: string): Promise<any | null> {
  try {
    const res = await requestApi(`/api/recording/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ roomName, outputFile }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function stopRecording(egressId: string): Promise<any | null> {
  try {
    const res = await requestApi(`/api/recording/stop`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ egressId }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function listRecordings(): Promise<any[]> {
  try {
    const res = await requestApi(`/api/recordings`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
