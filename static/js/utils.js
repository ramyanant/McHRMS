/** Shared formatting utilities */
export const fmt = {
  date: (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    } catch { return d; }
  },
  money: (n) => {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-IN').format(parseFloat(n));
  },
  inr: (n) => n != null ? '₹' + fmt.money(n) : '—',
  ini: (name) => {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase();
  },
  avColor: (name) => {
    const colors = ['av-green','av-blue','av-purple','av-amber','av-teal','av-red'];
    const i = (name||'').charCodeAt(0) % colors.length;
    return colors[i];
  },
  timeAgo: (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff/60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24)  return `${hrs}h ago`;
    return fmt.date(d);
  },
  phone: (p) => p || '—',
  truncate: (s, n=40) => s && s.length > n ? s.slice(0,n)+'…' : (s||'—'),
};

/** Build select options HTML from master list */
export function buildOptions(items, valueKey='id', labelKey='name', selectedVal='', placeholder='Select...') {
  const opts = placeholder ? `<option value="">${placeholder}</option>` : '';
  return opts + (items||[]).map(i =>
    `<option value="${i[valueKey]}" ${String(i[valueKey])===String(selectedVal)?'selected':''}>${i[labelKey]}</option>`
  ).join('');
}

/** Debounce */
export function debounce(fn, ms=300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
}

/** Simple form data extractor */
export function getFormData(formEl) {
  const data = {};
  new FormData(formEl).forEach((v, k) => { data[k] = v === '' ? null : v; });
  return data;
}
