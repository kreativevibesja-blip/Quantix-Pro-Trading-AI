// Support deployment: prefer Vite env var, fallback to window override, then localhost.
const API_BASE = (import.meta?.env?.VITE_API_BASE_URL) || (typeof window !== 'undefined' && window.__API_URL__) || 'http://localhost:3333';

export function getToken(){
  return localStorage.getItem('token') || '';
}
export function setToken(token){
  if (token) localStorage.setItem('token', token);
}
export function clearToken(){
  localStorage.removeItem('token');
}
export function getWorkspace(){
  try { return JSON.parse(localStorage.getItem('workspace') || 'null'); } catch { return null; }
}
export function setWorkspace(ws){
  localStorage.setItem('workspace', JSON.stringify(ws||null));
}

export async function apiFetch(path, opts={}){
  const headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    if (res.status === 401) {
      // auto logout on 401
      clearToken();
    }
  }
  return res;
}
