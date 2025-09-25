const BASE_URL = import.meta.env.VITE_API_URL || 'https://bond-calculator-seven.vercel.app';

async function request(path, options = {}) {
  const init = {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  };

  if (options.body && init.headers['Content-Type'] === 'application/json') {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch (err) {
      // no-op
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function getBonds() {
  return request('/api/bonds');
}

export function priceSchedule(payload) {
  return request('/api/priceSchedule', { method: 'POST', body: payload });
}

export function ytmSchedule(payload) {
  return request('/api/ytmSchedule', { method: 'POST', body: payload });
}

export function priceDirect(payload) {
  return request('/api/priceDirect', { method: 'POST', body: payload });
}

export function ytmDirect(payload) {
  return request('/api/ytmDirect', { method: 'POST', body: payload });
}

export async function uploadCF(isin, file) {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${BASE_URL}/api/uploadCF/${isin}`, {
    method: 'POST',
    body: form
  });
  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch (err) {
      // ignore
    }
    throw new Error(message);
  }
  return response.json();
}