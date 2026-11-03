import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Assumptions } from '../engine/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when the build has no Supabase settings: the app then runs in local mode (browser storage only). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

export const ENGINE_VERSION = '2026.11.03';

export interface ProjectRow {
  id: string;
  name: string;
  assumptions: Assumptions;
  engine_version: string;
  updated_at: string;
}
export interface ShareLink {
  token: string;
  created_at: string;
  revoked_at: string | null;
}

function must(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await must().from('projects').select('id,name,assumptions,engine_version,updated_at').order('updated_at', { ascending: false });
  if (error) throw error;
  return data as ProjectRow[];
}
export async function getProject(id: string): Promise<ProjectRow> {
  const { data, error } = await must().from('projects').select('id,name,assumptions,engine_version,updated_at').eq('id', id).single();
  if (error) throw error;
  return data as ProjectRow;
}
export async function createProject(name: string, a: Assumptions): Promise<ProjectRow> {
  const { data, error } = await must().from('projects').insert({ name, assumptions: a, engine_version: ENGINE_VERSION }).select('id,name,assumptions,engine_version,updated_at').single();
  if (error) throw error;
  return data as ProjectRow;
}
export async function saveProject(id: string, name: string, a: Assumptions): Promise<void> {
  const { error } = await must().from('projects').update({ name, assumptions: a, engine_version: ENGINE_VERSION }).eq('id', id);
  if (error) throw error;
}
export async function deleteProject(id: string): Promise<void> {
  const { error } = await must().from('projects').delete().eq('id', id);
  if (error) throw error;
}
export async function listLinks(projectId: string): Promise<ShareLink[]> {
  const { data, error } = await must().from('share_links').select('token,created_at,revoked_at').eq('project_id', projectId).order('created_at', { ascending: false });
  if (error) throw error;
  return data as ShareLink[];
}
export async function createLink(projectId: string): Promise<ShareLink> {
  const { data, error } = await must().from('share_links').insert({ project_id: projectId }).select('token,created_at,revoked_at').single();
  if (error) throw error;
  return data as ShareLink;
}
export async function revokeLink(token: string): Promise<void> {
  const { error } = await must().from('share_links').update({ revoked_at: new Date().toISOString() }).eq('token', token);
  if (error) throw error;
}
export async function getShared(token: string): Promise<{ name: string; assumptions: Assumptions; engine_version: string; updated_at: string } | null> {
  const { data, error } = await must().rpc('get_shared_project', { p_token: token });
  if (error) throw error;
  const rows = data as { name: string; assumptions: Assumptions; engine_version: string; updated_at: string }[];
  return rows[0] ?? null;
}
