import React from 'react';
import { useAuthUser } from '@/contexts/AuthUserContext';
import AdminLayout from '@/components/admin/AdminLayout';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Package, ShoppingBag, TrendingUp, AlertTriangle, XCircle, BarChart2, ArrowRight, Users, Boxes } from 'lucide-react';

const STATUS_COLORS = {
  New:                'bg-blue-50 text-blue-700',
  Confirmed:          'bg-indigo-50 text-indigo-700',
  Packed:             'bg-violet-50 text-violet-700',
  'Out for Delivery': 'bg-amber-50 text-amber-700',
  Delivered:          'bg-green-50 text-green-700',
  Cancelled:          'bg-destructive/10 text-destructive',
};

function KpiCard({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm text-muted-foreground font-medium leading-tight">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-heading font-bold text-foreground">
          {loading ? <span className="inline-block w-12 h-6 bg-muted rounded animate-pulse" /> : (value ?? '—')}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// Inline SVG sparkline — no chart dependency.
function Sparkline({ data = [], color = 'hsl(var(--primary))' }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 120, h = 32, step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdminDashboard() {
  const { currentUser } = useAuthUser();
  const navigate = useNavigate();

  // Single server-computed snapshot. Money fields are stripped server-side for
  // non-super-admins, so the browser never receives them. Live refetch keeps the
  // numbers current (the prior client-computed dashboard went stale).
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-snapshot'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboard', {});
      return res?.data || res;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
  });

  const c = data?.counts || {};
  const showMoney = !!data?.show_money;
  const money = data?.money || {};
  const trend = data?.trend || {};
  const trendPct = trend.ordersPrev7d > 0
    ? Math.round(((trend.orders7d - trend.ordersPrev7d) / trend.ordersPrev7d) * 100)
    : null;

  return (
    <AdminLayout>
      <div className="p-5 lg:p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">
            Welcome back{currentUser?.full_name ? `, ${currentUser.full_name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening at AURA today.</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <KpiCard icon={Package}       label="Total Products"    value={c.totalProducts}     color="bg-primary/10 text-primary"          loading={isLoading} />
          <KpiCard icon={Boxes}         label="Items in Stock"    value={c.itemsInStock}      color="bg-secondary/20 text-secondary"      loading={isLoading} />
          <KpiCard icon={AlertTriangle} label="Low Stock"         value={c.lowStockCount}     color="bg-amber-50 text-amber-600"          loading={isLoading} />
          <KpiCard icon={XCircle}       label="Out of Stock"      value={c.outOfStockCount}   color="bg-destructive/10 text-destructive"  loading={isLoading} />
          <KpiCard icon={ShoppingBag}   label="Orders Today"      value={c.ordersToday}       color="bg-blue-50 text-blue-600"            loading={isLoading} />
          <KpiCard icon={ShoppingBag}   label="Orders (30d)"      value={c.orders30d}         sub={trendPct != null ? `${trendPct >= 0 ? '▲' : '▼'} ${Math.abs(trendPct)}% vs prev 7d` : undefined} color="bg-indigo-50 text-indigo-600" loading={isLoading} />
          <KpiCard icon={Package}       label="Open Orders"       value={c.openOrders}        color="bg-violet-50 text-violet-600"        loading={isLoading} />
          <KpiCard icon={Users}         label="Customers"         value={c.totalCustomers}    color="bg-teal-50 text-teal-600"            loading={isLoading} />
          {showMoney && (
            <>
              <KpiCard icon={TrendingUp} label="Revenue This Month" value={`$${(money.revenueThisMonth || 0).toFixed(2)}`} color="bg-green-50 text-green-700" loading={isLoading} />
              <KpiCard icon={BarChart2}  label="Avg Order Value"    value={`$${(money.aov || 0).toFixed(2)}`}              color="bg-emerald-50 text-emerald-700" loading={isLoading} />
              <KpiCard icon={TrendingUp} label="Revenue (7d)"       value={`$${(money.revenue7d || 0).toFixed(2)}`}        color="bg-green-50 text-green-700" loading={isLoading} />
              <KpiCard icon={TrendingUp} label="Revenue (30d)"      value={`$${(money.revenue30d || 0).toFixed(2)}`}       color="bg-green-50 text-green-700" loading={isLoading} />
            </>
          )}
        </div>

        {/* Sparklines */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-muted-foreground mb-2">Orders — last 7 days</p>
            <Sparkline data={data?.spark?.orders || []} color="hsl(var(--primary))" />
          </div>
          {showMoney && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <p className="text-sm text-muted-foreground mb-2">Revenue — last 7 days</p>
              <Sparkline data={data?.spark?.revenue || []} color="#16a34a" />
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading font-semibold text-foreground">Recent Orders</h2>
              <Link to="/admin/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {(data?.recentOrders || []).length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">No orders yet.</p>
              )}
              {(data?.recentOrders || []).map(order => (
                <div key={order.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {order.order_number || order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {showMoney && <p className="text-sm font-semibold text-foreground">${(order.grand_total_usd || 0).toFixed(2)}</p>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.order_status] || 'bg-muted text-muted-foreground'}`}>
                      {order.order_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Low-stock alerts */}
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-heading font-semibold text-foreground">Low-Stock Alerts</h2>
              <Link to="/admin/inventory" className="text-xs text-primary hover:underline flex items-center gap-1">
                Inventory <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-border">
              {(data?.lowStockList || []).length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">All products are well stocked ✓</p>
              )}
              {(data?.lowStockList || []).map(p => (
                <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${p.qty <= 0 ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700'}`}>{p.qty} left</span>
                  <button
                    onClick={() => navigate('/admin/inventory')}
                    className="text-xs text-primary font-medium hover:underline shrink-0"
                  >
                    Restock
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
