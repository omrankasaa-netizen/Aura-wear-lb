import React, { useState, useMemo } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { useAuthUser } from '@/contexts/AuthUserContext';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AccessDenied from './AccessDenied';
import { downloadCsv, exportViaFunction, printTable, whatsappLink, whatsappGreeting } from '@/lib/adminExport';
import { Users, Search, Download, Mail, Printer, MessageCircle, X, Tag, Ban, ShieldCheck, Plus, Pencil } from 'lucide-react';

const TIER_COLORS = {
  Bronze: 'bg-amber-50 text-amber-700 border-amber-200',
  Silver: 'bg-slate-50 text-slate-700 border-slate-200',
  Gold: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  VIP: 'bg-purple-50 text-purple-700 border-purple-200',
};

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

// ── Detail drawer ───────────────────────────────────────────────────────────
function CustomerDrawer({ customerId, showMoney, onClose, onChanged, currentUser }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn: async () => { const r = await base44.functions.invoke('getCustomerDetail', { customer_id: customerId }); return r?.data || r; },
    enabled: !!customerId,
  });
  const c = data?.customer;
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { if (c) setNotes(c.notes || ''); }, [c]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['customer-detail', customerId] });
    onChanged();
  }
  async function addTag() {
    if (!tagInput.trim()) return;
    setBusy(true);
    const tags = [...(c.tags || []), tagInput.trim()];
    await base44.functions.invoke('setCustomerTags', { customer_id: customerId, tags });
    setTagInput(''); await refresh(); setBusy(false);
  }
  async function removeTag(t) {
    setBusy(true);
    await base44.functions.invoke('setCustomerTags', { customer_id: customerId, tags: (c.tags || []).filter(x => x !== t) });
    await refresh(); setBusy(false);
  }
  async function saveNotes() {
    setBusy(true);
    await base44.functions.invoke('setCustomerNotes', { customer_id: customerId, notes });
    await refresh(); setBusy(false);
  }
  async function toggleBlock() {
    setBusy(true);
    let reason = '';
    if (!c.is_blocked) { reason = window.prompt('Reason for blocking this customer?') || ''; }
    await base44.functions.invoke('setCustomerBlock', { customer_id: customerId, is_blocked: !c.is_blocked, block_reason: reason });
    await refresh(); setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border-l border-border shadow-2xl h-full overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-heading font-bold text-foreground">Customer</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        {isLoading || !c ? (
          <p className="p-5 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="p-5 space-y-5">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {(c.name?.[0] || 'C').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{c.name || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                {c.is_blocked && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Blocked</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-foreground">{c.phone || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">City</p><p className="text-foreground">{c.city || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Type</p><p className="text-foreground">{c.is_guest ? 'Guest' : 'Account'}</p></div>
              <div><p className="text-xs text-muted-foreground">Orders</p><p className="text-foreground">{c.total_orders}</p></div>
              {showMoney && <div><p className="text-xs text-muted-foreground">Total Spent</p><p className="font-semibold text-primary">${(c.total_spent || 0).toFixed(2)}</p></div>}
              {showMoney && <div><p className="text-xs text-muted-foreground">AOV</p><p className="text-foreground">${(c.aov || 0).toFixed(2)}</p></div>}
            </div>

            {c.phone && (
              <a href={whatsappLink(c.phone, whatsappGreeting(c.name))} target="_blank" rel="noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}

            {/* Tags */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(c.tags || []).map(t => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground flex items-center gap-1">
                    {t}<button onClick={() => removeTag(t)} className="hover:text-destructive">×</button>
                  </span>
                ))}
                {(c.tags || []).length === 0 && <span className="text-xs text-muted-foreground">No tags</span>}
              </div>
              <div className="flex gap-2">
                <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
                  placeholder="Add tag (e.g. VIP)" className="flex-1 px-3 py-1.5 rounded-xl border border-input bg-background text-sm" />
                <button onClick={addTag} disabled={busy} className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-sm">Add</button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Private internal notes</p>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm resize-none" />
              <button onClick={saveNotes} disabled={busy} className="mt-1.5 px-3 py-1.5 rounded-xl border border-border text-sm hover:bg-muted">Save notes</button>
            </div>

            {/* Block */}
            <button onClick={toggleBlock} disabled={busy}
              className={`flex items-center justify-center gap-2 w-full py-2 rounded-xl text-sm font-semibold ${c.is_blocked ? 'bg-muted text-foreground hover:bg-muted/70' : 'bg-destructive/10 text-destructive hover:bg-destructive/20'}`}>
              {c.is_blocked ? <><ShieldCheck className="w-4 h-4" /> Unblock customer</> : <><Ban className="w-4 h-4" /> Block customer</>}
            </button>
            {c.is_blocked && c.block_reason && <p className="text-xs text-muted-foreground">Reason: {c.block_reason}</p>}

            {/* Order history */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Order history</p>
              <div className="border border-border rounded-xl divide-y divide-border">
                {(data.orders || []).length === 0 && <p className="px-3 py-3 text-sm text-muted-foreground">No orders.</p>}
                {(data.orders || []).map(o => (
                  <div key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{o.order_number || o.id.slice(0, 8)}</span>
                    <span className="text-xs text-muted-foreground">{String(o.order_date).slice(0, 10)}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground ml-auto">{o.order_status}</span>
                    {showMoney && <span className="font-semibold text-foreground">${(o.grand_total_usd || 0).toFixed(2)}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add/Edit modal ──────────────────────────────────────────────────────────
function CustomerEditModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', city: '' });
  const [saving, setSaving] = useState(false);
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })); }
  async function save() {
    setSaving(true);
    try { await base44.functions.invoke('upsertCustomer', form); onSaved(); }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-heading font-semibold text-foreground">Add Customer</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3">
          {[['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City']].map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-muted-foreground block mb-1">{label}</label>
              <input value={form[k]} onChange={e => setF(k, e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-input bg-background text-sm" />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Cancel</button>
            <button onClick={save} disabled={saving || !form.name}
              className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { currentUser, canAccess } = useAuthUser();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterTier, setFilterTier] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActivity, setFilterActivity] = useState('');
  const [filterRecency, setFilterRecency] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-customers-enriched'],
    queryFn: async () => { const r = await base44.functions.invoke('listCustomers', {}); return r?.data || r; },
    staleTime: 0,
  });
  const customers = data?.customers || [];
  const showMoney = !!data?.show_money;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return customers.filter(c => {
      if (q && !c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.phone?.includes(q)) return false;
      if (filterTier && c.tier !== filterTier) return false;
      if (filterType === 'account' && c.is_guest) return false;
      if (filterType === 'guest' && !c.is_guest) return false;
      if (filterActivity === 'new' && c.total_orders > 1) return false;
      if (filterActivity === 'repeat' && c.total_orders < 2) return false;
      if (filterRecency) {
        const d = daysSince(c.last_order_date);
        if (filterRecency === '30' && d > 30) return false;
        if (filterRecency === '90' && d > 90) return false;
        if (filterRecency === '180+' && d <= 180) return false;
        if (filterRecency === 'never' && c.total_orders > 0) return false;
      }
      return true;
    });
  }, [customers, search, filterTier, filterType, filterActivity, filterRecency]);

  if (!canAccess('view_orders')) return <AdminLayout><AccessDenied /></AdminLayout>;

  const filteredIds = filtered.map(c => c.id);

  async function exportCsv() { await exportViaFunction(base44, 'exportCustomersCsv', { ids: filteredIds }); }
  async function exportEmails() { await exportViaFunction(base44, 'exportCustomerEmailsCsv', { ids: filteredIds }); }
  function print() {
    const headers = ['Name', 'Email', 'Phone', 'City', 'Tier', 'Orders', 'Last Order'].concat(showMoney ? ['Total Spent'] : []);
    const rows = filtered.map(c => [c.name, c.email, c.phone, c.city, c.tier, c.total_orders,
      c.last_order_date ? String(c.last_order_date).slice(0, 10) : ''].concat(showMoney ? [`$${(c.total_spent || 0).toFixed(2)}`] : []));
    printTable('Customers', headers, rows);
  }

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Users className="w-6 h-6 text-primary" />
          <div className="mr-auto">
            <h1 className="text-2xl font-heading font-bold text-foreground">Customers</h1>
            <p className="text-sm text-muted-foreground">{customers.length} total · {filtered.length} shown</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"><Plus className="w-4 h-4" /> Add</button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={exportEmails} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"><Mail className="w-4 h-4" /> Emails</button>
          <button onClick={print} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"><Printer className="w-4 h-4" /> Print</button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
              className="bg-transparent text-sm flex-1 outline-none text-foreground placeholder:text-muted-foreground" />
          </div>
          <select value={filterTier} onChange={e => setFilterTier(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 cursor-pointer">
            <option value="">All Tiers</option><option>Bronze</option><option>Silver</option><option>Gold</option><option>VIP</option>
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 cursor-pointer">
            <option value="">Account & Guest</option><option value="account">Account</option><option value="guest">Guest</option>
          </select>
          <select value={filterActivity} onChange={e => setFilterActivity(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 cursor-pointer">
            <option value="">All</option><option value="new">New (≤1 order)</option><option value="repeat">Repeat (2+)</option>
          </select>
          <select value={filterRecency} onChange={e => setFilterRecency(e.target.value)} className="px-3 py-2 bg-muted rounded-xl text-sm text-foreground outline-none border-0 cursor-pointer">
            <option value="">Any recency</option><option value="30">Last 30d</option><option value="90">Last 90d</option><option value="180+">180+ days ago</option><option value="never">Never ordered</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Phone</th>
                  <th className="px-4 py-3 text-left">Tier</th>
                  <th className="px-4 py-3 text-center hidden sm:table-cell">Orders</th>
                  {showMoney && <th className="px-4 py-3 text-right hidden lg:table-cell">Total Spent</th>}
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</td></tr>}
                {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No customers found.</td></tr>}
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setOpenId(c.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {(c.name?.[0] || 'C').toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{c.name || '—'}</span>
                        {c.is_blocked && <Ban className="w-3.5 h-3.5 text-destructive" />}
                        {(c.tags || []).slice(0, 2).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>)}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{c.email}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{c.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${TIER_COLORS[c.tier] || TIER_COLORS.Bronze}`}>{c.tier}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell text-foreground font-medium">{c.total_orders}</td>
                    {showMoney && <td className="px-4 py-3 text-right hidden lg:table-cell"><span className="font-semibold text-primary">${(c.total_spent || 0).toFixed(2)}</span></td>}
                    <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                      {c.phone && (
                        <a href={whatsappLink(c.phone, whatsappGreeting(c.name))} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:underline">
                          <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {openId && (
        <CustomerDrawer customerId={openId} showMoney={showMoney} currentUser={currentUser}
          onClose={() => setOpenId(null)}
          onChanged={() => qc.invalidateQueries({ queryKey: ['admin-customers-enriched'] })} />
      )}
      {showAdd && (
        <CustomerEditModal onClose={() => setShowAdd(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['admin-customers-enriched'] }); setShowAdd(false); }} />
      )}
    </AdminLayout>
  );
}
