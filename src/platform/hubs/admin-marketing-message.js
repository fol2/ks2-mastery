function asTs(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

// Normalise a single admin marketing message from the server payload into a
// stable client shape. Kept separate from admin-read-model.js so the browser
// admin chunk does not import server-side hub aggregation or spelling content.
export function normaliseMarketingMessage(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) ? rawValue : {};
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    message_type: typeof raw.message_type === 'string' ? raw.message_type : 'announcement',
    status: typeof raw.status === 'string' ? raw.status : 'draft',
    title: typeof raw.title === 'string' ? raw.title : '',
    body_text: typeof raw.body_text === 'string' ? raw.body_text : '',
    severity_token: typeof raw.severity_token === 'string' ? raw.severity_token : 'info',
    audience: typeof raw.audience === 'string' ? raw.audience : 'internal',
    starts_at: raw.starts_at != null ? Number(raw.starts_at) : null,
    ends_at: raw.ends_at != null ? Number(raw.ends_at) : null,
    created_by: typeof raw.created_by === 'string' ? raw.created_by : '',
    updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : '',
    published_by: typeof raw.published_by === 'string' ? raw.published_by : null,
    created_at: asTs(raw.created_at, 0),
    updated_at: asTs(raw.updated_at, 0),
    published_at: raw.published_at != null ? asTs(raw.published_at, 0) : null,
    row_version: Math.max(0, Number(raw.row_version) || 0),
  };
}
