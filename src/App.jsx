import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Pizza, LogOut, LayoutDashboard, Package, ArrowDownToLine, ArrowUpFromLine, Settings, Edit2, Plus, Trash2, AlertCircle, X, Users, RefreshCw } from 'lucide-react';

// ⚠️ REEMPLAZÁ ESTOS VALORES CON LOS DE TU PROYECTO SUPABASE
const SUPABASE_URL = 'https://hrvbgtcbtwojupkuwudj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhydmJndGNidHdvanVwa3V3dWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMzc0NjksImV4cCI6MjA5NDcxMzQ2OX0.IBagQquPs2fbzK8qBpilOO3sw5rQl009PtOihjwt55o';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');

  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [productsData, setProductsData] = useState([]);
  const [stockManual, setStockManual] = useState({});
  const [ingresos, setIngresos] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [maosolDate, setMaosolDate] = useState(new Date().toISOString().split('T')[0]);
  const [freezerDate, setFreezerDate] = useState(new Date().toISOString().split('T')[0]);
const [verificadoDate, setVerificadoDate] = useState(new Date().toISOString().split('T')[0]);
const [verificadoHora, setVerificadoHora] = useState('');

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Cargar todos los datos desde Supabase
  const loadAllData = useCallback(async () => {
    try {
      const [usersRes, productsRes, stockRes, ingresosRes, egresosRes, configRes] = await Promise.all([
        supabase.from('usuarios').select('*').order('id'),
        supabase.from('productos').select('*').order('id'),
        supabase.from('stock_manual').select('*'),
        supabase.from('ingresos').select('*').order('id'),
        supabase.from('egresos').select('*').order('id'),
        supabase.from('config_global').select('*')
      ]);

      if (usersRes.data) setUsers(usersRes.data);
      if (productsRes.data) {
        setProductsData(productsRes.data);
        setProducts(productsRes.data.map(p => p.nombre));
      }
      if (stockRes.data) {
        const sm = {};
        stockRes.data.forEach(r => {
          if (!sm[r.producto]) sm[r.producto] = {};
          sm[r.producto][r.tipo] = { cantidad: r.cantidad, fecha: r.fecha, hora: r.hora };
        });
        setStockManual(sm);
      }
      if (ingresosRes.data) setIngresos(ingresosRes.data);
      if (egresosRes.data) setEgresos(egresosRes.data);
      if (configRes.data) {
  const md = configRes.data.find(c => c.key === 'maosolDate');
  const fd = configRes.data.find(c => c.key === 'freezerDate');
  const vd = configRes.data.find(c => c.key === 'verificadoDate');
  const vh = configRes.data.find(c => c.key === 'verificadoHora');
  if (md) setMaosolDate(md.value);
  if (fd) setFreezerDate(fd.value);
  if (vd) setVerificadoDate(vd.value);
  if (vh) setVerificadoHora(vh.value || '');
      }
    } catch (e) {
      console.error('Error cargando datos:', e);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadAllData();
      setLoading(false);
    })();
  }, [loadAllData]);

  // Realtime: actualizar cuando cambia algo
  useEffect(() => {
    const channel = supabase
      .channel('stock-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        loadAllData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAllData]);

  // ---- Helpers para actualizar Supabase ----
  const updateStockManual = async (producto, tipo, data) => {
    const existing = stockManual[producto] && stockManual[producto][tipo];
    const payload = {
      producto,
      tipo,
      cantidad: data.cantidad ?? (existing ? existing.cantidad : 0),
      fecha: data.fecha ?? (existing ? existing.fecha : null),
      hora: data.hora ?? (existing ? existing.hora : null)
    };
    const { error } = await supabase.from('stock_manual').upsert(payload, { onConflict: 'producto,tipo' });
    if (error) console.error(error);

    setStockManual(prev => ({
      ...prev,
      [producto]: { ...(prev[producto] || {}), [tipo]: payload }
    }));
  };

  const updateConfigGlobal = async (key, value) => {
    await supabase.from('config_global').upsert({ key, value });
  };
  const updateComentario = async (productoId, comentario) => {
    await supabase.from('productos').update({ comentario }).eq('id', productoId);
    setProductsData(prev => prev.map(p => p.id === productoId ? { ...p, comentario } : p));
  };

  // ---- Stock Fabrica calculado ----
  const stockFabrica = useMemo(() => {
    const result = {};
    products.forEach(p => { result[p] = 0; });
    ingresos.forEach(i => {
      if (result[i.producto] !== undefined) result[i.producto] += Number(i.cantidad) || 0;
    });
    egresos.forEach(e => {
      if (result[e.producto] !== undefined) result[e.producto] -= Number(e.cantidad) || 0;
    });
    return result;
  }, [ingresos, egresos, products]);

  const stockPorLote = useMemo(() => {
    const lotes = {};
    ingresos.forEach(ing => {
      const key = `${ing.producto}||${ing.lote}`;
      if (!lotes[key]) {
        lotes[key] = {
          producto: ing.producto,
          lote: ing.lote,
          vencimiento: ing.vencimiento,
          cantidadIngresada: 0,
          cantidadEgresada: 0
        };
      }
      lotes[key].cantidadIngresada += Number(ing.cantidad) || 0;
    });
    egresos.forEach(eg => {
      if (eg.lote === 'COMODIN') return;
      const key = `${eg.producto}||${eg.lote}`;
      if (lotes[key]) lotes[key].cantidadEgresada += Number(eg.cantidad) || 0;
    });
    return Object.values(lotes).map(l => ({ ...l, stockDisponible: l.cantidadIngresada - l.cantidadEgresada }));
  }, [ingresos, egresos]);

  const handleLogin = () => {
    const found = users.find(u => u.username === loginUser && u.password === loginPass);
    if (found) {
      setUser(found);
      setLoginError('');
      setLoginUser('');
      setLoginPass('');
    } else {
      setLoginError('Usuario o contraseña incorrectos');
    }
  };

  const handleLogout = () => { setUser(null); setTab('dashboard'); };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-50">
        <div className="text-blue-700 text-xl">Conectando con la base de datos...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="bg-yellow-400 px-8 py-6 flex items-center gap-3">
            <Pizza className="w-10 h-10 text-blue-800" />
            <div>
              <h1 className="text-2xl font-bold text-blue-900">Dos Orientales SAS</h1>
              <p className="text-blue-800 text-sm">Sistema de Stock</p>
            </div>
          </div>
          <div className="p-8 space-y-4">
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-1">Usuario</label>
              <input type="text" value={loginUser} onChange={(e) => setLoginUser(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-blue-900 mb-1">Contraseña</label>
              <input type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            {loginError && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />{loginError}
              </div>
            )}
            <button onClick={handleLogin} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg transition shadow-md">
              Ingresar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canEditConfig = user.role === 'Administrador' || user.role === 'Encargado';
  const canManageUsers = user.role === 'Administrador';

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-blue-700 text-white shadow-lg">
        <div className="px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-400 p-2 rounded-lg">
              <Pizza className="w-6 h-6 text-blue-800" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Dos Orientales SAS</h1>
              <p className="text-xs text-blue-200">Sistema de Control de Stock</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={loadAllData} className="bg-blue-800 hover:bg-blue-900 p-2 rounded-lg" title="Refrescar">
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="text-right">
              <p className="font-semibold text-sm">{user.name}</p>
              <p className="text-xs text-yellow-300">{user.role}</p>
            </div>
            <button onClick={handleLogout} className="bg-blue-800 hover:bg-blue-900 px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition">
              <LogOut className="w-4 h-4" /> Salir
            </button>
          </div>
        </div>
        <nav className="bg-blue-800 px-6 flex flex-wrap gap-1 overflow-x-auto">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={LayoutDashboard}>Dashboard</TabButton>
          <TabButton active={tab === 'lotes'} onClick={() => setTab('lotes')} icon={Package}>Stock por Lote</TabButton>
          <TabButton active={tab === 'ingreso'} onClick={() => setTab('ingreso')} icon={ArrowDownToLine}>Ingreso a Cámara</TabButton>
          <TabButton active={tab === 'egreso'} onClick={() => setTab('egreso')} icon={ArrowUpFromLine}>Egreso de Cámara</TabButton>
          {canEditConfig && <TabButton active={tab === 'config'} onClick={() => setTab('config')} icon={Settings}>Configuración</TabButton>}
        </nav>
      </header>

      <main className="p-4 md:p-6">
{tab === 'dashboard' && (
  <Dashboard products={products} productsData={productsData} stockManual={stockManual} stockFabrica={stockFabrica}
    maosolDate={maosolDate} freezerDate={freezerDate} verificadoDate={verificadoDate} verificadoHora={verificadoHora} user={user}
    updateStockManual={updateStockManual}
    setMaosolDate={(v) => { setMaosolDate(v); updateConfigGlobal('maosolDate', v); }}
    setFreezerDate={(v) => { setFreezerDate(v); updateConfigGlobal('freezerDate', v); }}
    setVerificadoDate={(v) => { setVerificadoDate(v); updateConfigGlobal('verificadoDate', v); }}
    setVerificadoHora={(v) => { setVerificadoHora(v); updateConfigGlobal('verificadoHora', v); }}
    updateComentario={updateComentario}
            onAdjustIngreso={async (ingreso) => {
              const { data } = await supabase.from('ingresos').insert(ingreso).select();
              if (data) setIngresos([...ingresos, ...data]);
            }} />
        )}
        {tab === 'lotes' && <StockPorLote products={products} stockPorLote={stockPorLote} />}
        {tab === 'ingreso' && <IngresoCamara products={products} ingresos={ingresos} user={user}
          onAdd={async (data) => {
            const { data: r } = await supabase.from('ingresos').insert(data).select();
            if (r) setIngresos([...ingresos, ...r]);
          }}
          onUpdate={async (id, data) => {
            await supabase.from('ingresos').update(data).eq('id', id);
            setIngresos(ingresos.map(i => i.id === id ? { ...i, ...data } : i));
          }}
          onDelete={async (id) => {
            await supabase.from('ingresos').delete().eq('id', id);
            setIngresos(ingresos.filter(i => i.id !== id));
          }} />}
        {tab === 'egreso' && <EgresoCamara products={products} stockPorLote={stockPorLote} egresos={egresos} user={user}
          onAdd={async (data) => {
            const { data: r } = await supabase.from('egresos').insert(data).select();
            if (r) setEgresos([...egresos, ...r]);
          }}
          onUpdate={async (id, data) => {
            await supabase.from('egresos').update(data).eq('id', id);
            setEgresos(egresos.map(eg => eg.id === id ? { ...eg, ...data } : eg));
          }}
          onDelete={async (id) => {
            await supabase.from('egresos').delete().eq('id', id);
            setEgresos(egresos.filter(eg => eg.id !== id));
          }} />}
        {tab === 'config' && canEditConfig && (
          <Configuracion productsData={productsData} users={users} canManageUsers={canManageUsers}
            onAddProduct={async (nombre) => {
              const { data } = await supabase.from('productos').insert({ nombre, min_fabrica: 0, min_total: 0, max_total: 100 }).select();
              if (data) { setProductsData([...productsData, ...data]); setProducts([...products, nombre]); }
            }}
            onUpdateProduct={async (id, field, value) => {
              await supabase.from('productos').update({ [field]: value }).eq('id', id);
              setProductsData(productsData.map(p => p.id === id ? { ...p, [field]: value } : p));
            }}
            onDeleteProduct={async (id, nombre) => {
              await supabase.from('productos').delete().eq('id', id);
              setProductsData(productsData.filter(p => p.id !== id));
              setProducts(products.filter(p => p !== nombre));
            }}
            onAddUser={async (u) => {
              const { data } = await supabase.from('usuarios').insert(u).select();
              if (data) setUsers([...users, ...data]);
            }}
            onDeleteUser={async (id) => {
              await supabase.from('usuarios').delete().eq('id', id);
              setUsers(users.filter(u => u.id !== id));
            }} />
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
      active ? 'border-yellow-400 text-yellow-300 bg-blue-900' : 'border-transparent text-blue-100 hover:bg-blue-700'
    }`}>
      <Icon className="w-4 h-4" />{children}
    </button>
  );
}

function Dashboard({ products, productsData, stockManual, stockFabrica, maosolDate, freezerDate, verificadoDate, verificadoHora, user, updateStockManual, setMaosolDate, setFreezerDate, setVerificadoDate, setVerificadoHora, onAdjustIngreso, updateComentario }) {
  const [adjustModal, setAdjustModal] = useState(null);
  const canAdjust = user.role === 'Administrador' || user.role === 'Encargado';

  const getStock = (producto, tipo) => {
    const v = stockManual[producto] && stockManual[producto][tipo];
    return v || { cantidad: 0, fecha: '', hora: '' };
  };

  const getCfg = (producto) => {
    const p = productsData.find(pd => pd.nombre === producto);
    return p ? { minFabrica: p.min_fabrica, minTotal: p.min_total, maxTotal: p.max_total } : { minFabrica: 0, minTotal: 0, maxTotal: 0 };
  };

  const handleAjustar = async (producto, diferencia, operarioAjuste, motivoAjuste) => {
    if (!operarioAjuste.trim() || !motivoAjuste.trim()) {
      alert('Por favor completá el operario y el motivo del ajuste');
      return;
    }
    const fecha = new Date().toISOString().split('T')[0];
    if (diferencia > 0) {
      await onAdjustIngreso({
        fecha, producto,
        lote: 'AJUSTE-' + Date.now().toString().slice(-6),
        fecha_produccion: fecha, vencimiento: fecha,
        cantidad: diferencia, operario: operarioAjuste,
        observaciones: `AJUSTE: ${motivoAjuste}`
      });
    }
    setAdjustModal(null);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-yellow-400">
        <h2 className="text-xl font-bold text-blue-900 mb-1">Dashboard de Stock</h2>
        <p className="text-sm text-blue-700">Vista general del stock por depósito y producto</p>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="px-3 py-3 text-left sticky left-0 bg-blue-700 z-10">Producto</th>
              <th className="px-3 py-3 text-center"><div>STOCK MAOSOL</div>
                <input type="date" value={maosolDate} onChange={(e) => setMaosolDate(e.target.value)} className="mt-1 text-blue-900 text-xs px-1 py-0.5 rounded" /></th>
              <th className="px-3 py-3 text-center">STOCK FABRICA</th>
              <th className="px-3 py-3 text-center"><div>STOCK FREEZER</div>
                <input type="date" value={freezerDate} onChange={(e) => setFreezerDate(e.target.value)} className="mt-1 text-blue-900 text-xs px-1 py-0.5 rounded" /></th>
              <th className="px-3 py-3 text-center bg-blue-800">STOCK TOTAL</th>
             <th className="px-3 py-3 text-center">
  <div>STOCK VERIFICADO MANUAL</div>
  <div className="flex gap-1 mt-1 justify-center">
    <input type="date" value={verificadoDate} onChange={(e) => setVerificadoDate(e.target.value)} className="text-blue-900 text-xs px-1 py-0.5 rounded" />
    <input type="time" value={verificadoHora} onChange={(e) => setVerificadoHora(e.target.value)} className="text-blue-900 text-xs px-1 py-0.5 rounded" />
  </div>
</th>
              <th className="px-3 py-3 text-center">DIFERENCIA</th>
              <th className="px-3 py-3 text-center">MIN. FABRICA</th>
              <th className="px-3 py-3 text-center">MIN. TOTAL</th>
              <th className="px-3 py-3 text-center">MAX. TOTAL</th>
              <th className="px-3 py-3 text-center">ESTADO</th>
              <th className="px-3 py-3 text-center">AJUSTE</th>
              <th className="px-3 py-3 text-center">COMENTARIOS</th>
            </tr>
          </thead>
          <tbody>
            {products.map((producto, idx) => {
              const sm = getStock(producto, 'maosol');
              const sf = getStock(producto, 'freezer');
              const sv = getStock(producto, 'verificado');
              const sFab = stockFabrica[producto] || 0;
              const total = Number(sm.cantidad) + Number(sf.cantidad) + sFab;
              const diferencia = Number(sv.cantidad) - sFab;
              const cfg = getCfg(producto);
              const prodData = productsData.find(pd => pd.nombre === producto);
              let estado = 'OK', estadoColor = 'bg-green-100 text-green-800 border-green-300';
              if (total < cfg.minTotal) { estado = 'BAJO MÍNIMO'; estadoColor = 'bg-red-100 text-red-800 border-red-300'; }
              else if (total > cfg.maxTotal) { estado = 'SOBRESTOCK'; estadoColor = 'bg-orange-100 text-orange-800 border-orange-300'; }
              const difColor = diferencia === 0 ? '' : diferencia > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
              const rowBg = idx % 2 === 0 ? 'white' : '#eff6ff';
              return (
                <tr key={producto} style={{ background: rowBg }}>
                  <td className="px-3 py-2 font-medium text-blue-900 sticky left-0 z-10" style={{ background: rowBg }}>{producto}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={sm.cantidad} onChange={(e) => updateStockManual(producto, 'maosol', { cantidad: Number(e.target.value) || 0 })}
                      className="w-16 text-center border border-blue-200 rounded px-1 py-0.5" />
                  </td>
                  <td className="px-3 py-2 text-center font-semibold">{sFab}</td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" value={sf.cantidad} onChange={(e) => updateStockManual(producto, 'freezer', { cantidad: Number(e.target.value) || 0 })}
                      className="w-16 text-center border border-blue-200 rounded px-1 py-0.5" />
                  </td>
                  <td className="px-3 py-2 text-center font-bold text-blue-900 bg-yellow-50">{total}</td>
           <td className="px-3 py-2 text-center">
  <input type="number" value={sv.cantidad} onChange={(e) => updateStockManual(producto, 'verificado', { cantidad: Number(e.target.value) || 0 })}
    className="w-16 text-center border border-blue-200 rounded px-1 py-0.5" />
</td>
                  <td className={`px-3 py-2 text-center font-semibold ${difColor}`}>{diferencia}</td>
                  <td className="px-3 py-2 text-center text-blue-800">{cfg.minFabrica}</td>
                  <td className="px-3 py-2 text-center text-blue-800">{cfg.minTotal}</td>
                  <td className="px-3 py-2 text-center text-blue-800">{cfg.maxTotal}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${estadoColor}`}>{estado}</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {diferencia !== 0 && canAdjust && (
                      <button onClick={() => setAdjustModal({ producto, diferencia })} className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 p-1.5 rounded transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="text"
                      maxLength="40"
                      defaultValue={prodData ? (prodData.comentario || '') : ''}
                      onBlur={(e) => { if (prodData) updateComentario(prodData.id, e.target.value); }}
                      placeholder="..."
                      className="w-40 text-xs border border-blue-200 rounded px-2 py-1"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-blue-900 text-white font-bold">
              <td className="px-3 py-3 sticky left-0 bg-blue-900 z-10">TOTAL</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + Number(getStock(p, 'maosol').cantidad || 0), 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + (stockFabrica[p] || 0), 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + Number(getStock(p, 'freezer').cantidad || 0), 0)}</td>
              <td className="px-3 py-3 text-center bg-yellow-400 text-blue-900">
                {products.reduce((s, p) => s + Number(getStock(p, 'maosol').cantidad || 0) + Number(getStock(p, 'freezer').cantidad || 0) + (stockFabrica[p] || 0), 0)}
              </td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + Number(getStock(p, 'verificado').cantidad || 0), 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + (Number(getStock(p, 'verificado').cantidad || 0) - (stockFabrica[p] || 0)), 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + getCfg(p).minFabrica, 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + getCfg(p).minTotal, 0)}</td>
              <td className="px-3 py-3 text-center">{products.reduce((s, p) => s + getCfg(p).maxTotal, 0)}</td>
              <td className="px-3 py-3"></td>
              <td className="px-3 py-3"></td>
              <td className="px-3 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      {adjustModal && <AjusteModal modal={adjustModal} defaultOperario={user.name} onClose={() => setAdjustModal(null)} onConfirm={handleAjustar} />}
    </div>
  );
}

function AjusteModal({ modal, defaultOperario, onClose, onConfirm }) {
  const [operario, setOperario] = useState(defaultOperario);
  const [motivo, setMotivo] = useState('');
  return (
    <Modal onClose={onClose} title="Confirmar Ajuste de Stock">
      <p className="text-blue-900 mb-2">Producto: <strong>{modal.producto}</strong></p>
      <p className="text-sm text-blue-700 mb-4">
        Diferencia detectada: <strong>{modal.diferencia}</strong> unidades.
        {modal.diferencia > 0 ? ' Se agregará un ingreso de ajuste.' : ' Generá un egreso de ajuste en Egreso de Cámara.'}
      </p>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-blue-900 mb-1">Operario que realiza el ajuste *</label>
          <input type="text" value={operario} onChange={(e) => setOperario(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs font-medium text-blue-900 mb-1">Motivo del ajuste *</label>
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="input" rows="3" placeholder="Explicá el motivo..." />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">Cancelar</button>
        {modal.diferencia > 0 && (
          <button onClick={() => onConfirm(modal.producto, modal.diferencia, operario, motivo)} className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg">Confirmar</button>
        )}
      </div>
    </Modal>
  );
}

function StockPorLote({ products, stockPorLote }) {
  const [filter, setFilter] = useState('TODOS');
  const filtered = filter === 'TODOS' ? stockPorLote : stockPorLote.filter(l => l.producto === filter);
  const getDiasVencer = (v) => { if (!v) return null; return Math.floor((new Date(v) - new Date()) / 86400000); };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-yellow-400">
        <h2 className="text-xl font-bold text-blue-900 mb-3">Stock por Lote</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-blue-900">Seleccionar producto:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-blue-300 rounded-lg px-3 py-2 text-sm">
            <option value="TODOS">TODOS</option>
            {products.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-blue-700 text-white">
            <tr>
              <th className="px-3 py-3 text-left">Producto</th><th className="px-3 py-3 text-center">N° Lote</th>
              <th className="px-3 py-3 text-center">Vencimiento</th><th className="px-3 py-3 text-center">Cant. Ingresada</th>
              <th className="px-3 py-3 text-center">Cant. Egresada</th><th className="px-3 py-3 text-center">Stock Disponible</th>
              <th className="px-3 py-3 text-center">Días a Vencer</th><th className="px-3 py-3 text-center">Alerta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan="8" className="px-3 py-6 text-center text-gray-500">No hay lotes registrados</td></tr>
            : filtered.map((l, idx) => {
              const dias = getDiasVencer(l.vencimiento);
              const alerta = dias !== null && dias < 60 && l.stockDisponible > 0;
              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                  <td className="px-3 py-2 font-medium text-blue-900">{l.producto}</td>
                  <td className="px-3 py-2 text-center">{l.lote}</td>
                  <td className="px-3 py-2 text-center">{l.vencimiento}</td>
                  <td className="px-3 py-2 text-center">{l.cantidadIngresada}</td>
                  <td className="px-3 py-2 text-center">{l.cantidadEgresada}</td>
                  <td className="px-3 py-2 text-center font-bold text-blue-900">{l.stockDisponible}</td>
                  <td className={`px-3 py-2 text-center font-semibold ${dias !== null && dias < 0 ? 'text-red-600' : dias !== null && dias < 60 ? 'text-orange-600' : 'text-blue-800'}`}>{dias !== null ? dias : '-'}</td>
                  <td className="px-3 py-2 text-center">
                    {dias !== null && dias < 0 && l.stockDisponible > 0 && <span className="bg-red-100 text-red-800 border border-red-300 px-2 py-1 rounded-full text-xs font-semibold">VENCIDO</span>}
                    {alerta && dias >= 0 && <span className="bg-orange-100 text-orange-800 border border-orange-300 px-2 py-1 rounded-full text-xs font-semibold">PRÓXIMO A VENCER</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IngresoCamara({ products, ingresos, user, onAdd, onUpdate, onDelete }) {
  const [form, setForm] = useState({ fecha: new Date().toISOString().split('T')[0], producto: '', lote: '', fecha_produccion: '', vencimiento: '', cantidad: '', operario: user.name, observaciones: '' });
  const [editing, setEditing] = useState(null);
  const resetForm = () => { setForm({ fecha: new Date().toISOString().split('T')[0], producto: '', lote: '', fecha_produccion: '', vencimiento: '', cantidad: '', operario: user.name, observaciones: '' }); setEditing(null); };
  const handleSubmit = async () => {
    if (!form.fecha || !form.producto || !form.lote || !form.fecha_produccion || !form.vencimiento || !form.cantidad || !form.operario) { alert('Completá todos los campos obligatorios'); return; }
    const data = { ...form, cantidad: Number(form.cantidad) };
    if (editing) await onUpdate(editing, data);
    else await onAdd(data);
    resetForm();
  };
  const handleEdit = (i) => { setForm(i); setEditing(i.id); };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-yellow-400">
        <h2 className="text-xl font-bold text-blue-900 mb-1">Ingreso a Cámara</h2>
        <p className="text-sm text-blue-700">Registrá nuevos ingresos al depósito Fábrica</p>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-semibold text-blue-900 mb-3">{editing ? 'Editar Ingreso' : 'Nuevo Ingreso'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Fecha ingreso *"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="input" /></Field>
          <Field label="Producto *"><select value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value })} className="input"><option value="">Seleccionar...</option>{products.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="N° Lote *"><input type="text" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} className="input" /></Field>
          <Field label="Fecha producción *"><input type="date" value={form.fecha_produccion} onChange={(e) => setForm({ ...form, fecha_produccion: e.target.value })} className="input" /></Field>
          <Field label="Fecha vencimiento *"><input type="date" value={form.vencimiento} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} className="input" /></Field>
          <Field label="Cantidad *"><input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className="input" /></Field>
          <Field label="Operario *"><input type="text" value={form.operario} onChange={(e) => setForm({ ...form, operario: e.target.value })} className="input" /></Field>
          <Field label="Observaciones"><input type="text" value={form.observaciones || ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="input" /></Field>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSubmit} className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" />{editing ? 'Guardar' : 'Registrar'}</button>
          {editing && <button onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 px-5 py-2 rounded-lg">Cancelar</button>}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <h3 className="font-semibold text-blue-900 p-4 border-b border-blue-100">Historial de Ingresos</h3>
        <table className="w-full text-sm">
          <thead className="bg-blue-700 text-white"><tr>
            <th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Lote</th>
            <th className="px-3 py-2 text-left">Prod.</th><th className="px-3 py-2 text-left">Vto.</th><th className="px-3 py-2 text-center">Cant.</th>
            <th className="px-3 py-2 text-left">Operario</th><th className="px-3 py-2 text-left">Obs.</th><th className="px-3 py-2 text-center">Acciones</th>
          </tr></thead>
          <tbody>
            {ingresos.length === 0 ? <tr><td colSpan="9" className="px-3 py-6 text-center text-gray-500">No hay ingresos</td></tr>
            : [...ingresos].reverse().map((i, idx) => (
              <tr key={i.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                <td className="px-3 py-2">{i.fecha}</td><td className="px-3 py-2 font-medium">{i.producto}</td>
                <td className="px-3 py-2">{i.lote}</td><td className="px-3 py-2">{i.fecha_produccion}</td>
                <td className="px-3 py-2">{i.vencimiento}</td><td className="px-3 py-2 text-center font-semibold">{i.cantidad}</td>
                <td className="px-3 py-2">{i.operario}</td><td className="px-3 py-2 text-xs">{i.observaciones}</td>
                <td className="px-3 py-2 text-center"><div className="flex gap-1 justify-center">
                  <button onClick={() => handleEdit(i)} className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 p-1.5 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm('¿Eliminar?')) onDelete(i.id); }} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EgresoCamara({ products, stockPorLote, egresos, user, onAdd, onUpdate, onDelete }) {
  const [form, setForm] = useState({ fecha: new Date().toISOString().split('T')[0], producto: '', lote: '', cantidad: '', destino: '', operario: user.name, observaciones: '' });
  const [editing, setEditing] = useState(null);
  const lotesDisponibles = useMemo(() => !form.producto ? [] : stockPorLote.filter(l => l.producto === form.producto && l.stockDisponible > 0), [form.producto, stockPorLote]);
  const resetForm = () => { setForm({ fecha: new Date().toISOString().split('T')[0], producto: '', lote: '', cantidad: '', destino: '', operario: user.name, observaciones: '' }); setEditing(null); };
  const handleSubmit = async () => {
    if (!form.fecha || !form.producto || !form.lote || !form.cantidad || !form.destino || !form.operario) { alert('Completá todos los campos obligatorios'); return; }
    const data = { ...form, cantidad: Number(form.cantidad) };
    if (editing) await onUpdate(editing, data);
    else await onAdd(data);
    resetForm();
  };
  const handleEdit = (eg) => { setForm(eg); setEditing(eg.id); };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-yellow-400">
        <h2 className="text-xl font-bold text-blue-900 mb-1">Egreso de Cámara</h2>
        <p className="text-sm text-blue-700">Registrá las salidas del depósito Fábrica</p>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-semibold text-blue-900 mb-3">{editing ? 'Editar Egreso' : 'Nuevo Egreso'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Fecha *"><input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} className="input" /></Field>
          <Field label="Producto *"><select value={form.producto} onChange={(e) => setForm({ ...form, producto: e.target.value, lote: '' })} className="input"><option value="">Seleccionar...</option>{products.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
          <Field label="Lote *"><select value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} className="input" disabled={!form.producto}><option value="">Seleccionar lote...</option>{lotesDisponibles.map(l => <option key={l.lote} value={l.lote}>{l.lote} (Stock: {l.stockDisponible}, Vto: {l.vencimiento})</option>)}<option value="COMODIN">COMODÍN</option></select></Field>
          <Field label="Cantidad *"><input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} className="input" /></Field>
          <Field label="Destino *"><input type="text" value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} className="input" /></Field>
          <Field label="Operario *"><input type="text" value={form.operario} onChange={(e) => setForm({ ...form, operario: e.target.value })} className="input" /></Field>
          <Field label="Observaciones"><input type="text" value={form.observaciones || ''} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} className="input" /></Field>
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={handleSubmit} className="bg-blue-700 hover:bg-blue-800 text-white font-semibold px-5 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" />{editing ? 'Guardar' : 'Registrar'}</button>
          {editing && <button onClick={resetForm} className="bg-gray-200 hover:bg-gray-300 px-5 py-2 rounded-lg">Cancelar</button>}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <h3 className="font-semibold text-blue-900 p-4 border-b border-blue-100">Historial de Egresos</h3>
        <table className="w-full text-sm">
          <thead className="bg-blue-700 text-white"><tr>
            <th className="px-3 py-2 text-left">Fecha</th><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-left">Lote</th>
            <th className="px-3 py-2 text-center">Cant.</th><th className="px-3 py-2 text-left">Destino</th>
            <th className="px-3 py-2 text-left">Operario</th><th className="px-3 py-2 text-left">Obs.</th><th className="px-3 py-2 text-center">Acciones</th>
          </tr></thead>
          <tbody>
            {egresos.length === 0 ? <tr><td colSpan="8" className="px-3 py-6 text-center text-gray-500">No hay egresos</td></tr>
            : [...egresos].reverse().map((eg, idx) => (
              <tr key={eg.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                <td className="px-3 py-2">{eg.fecha}</td><td className="px-3 py-2 font-medium">{eg.producto}</td>
                <td className="px-3 py-2">{eg.lote}</td><td className="px-3 py-2 text-center font-semibold">{eg.cantidad}</td>
                <td className="px-3 py-2">{eg.destino}</td><td className="px-3 py-2">{eg.operario}</td>
                <td className="px-3 py-2 text-xs">{eg.observaciones}</td>
                <td className="px-3 py-2 text-center"><div className="flex gap-1 justify-center">
                  <button onClick={() => handleEdit(eg)} className="bg-yellow-400 hover:bg-yellow-500 text-blue-900 p-1.5 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { if (confirm('¿Eliminar?')) onDelete(eg.id); }} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Configuracion({ productsData, users, canManageUsers, onAddProduct, onUpdateProduct, onDeleteProduct, onAddUser, onDeleteUser }) {
  const [newProduct, setNewProduct] = useState('');
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', role: 'Operario' });
  const handleAdd = () => { if (!newProduct.trim()) return; onAddProduct(newProduct.trim()); setNewProduct(''); };
  const handleAddU = () => {
    if (!newUser.username || !newUser.password || !newUser.name) { alert('Completá todos los campos'); return; }
    onAddUser(newUser); setNewUser({ username: '', password: '', name: '', role: 'Operario' });
  };
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-4 border-t-4 border-yellow-400">
        <h2 className="text-xl font-bold text-blue-900 mb-1">Configuración</h2>
        <p className="text-sm text-blue-700">Gestioná productos, mínimos/máximos y usuarios</p>
      </div>
      <div className="bg-white rounded-xl shadow p-4">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2"><Package className="w-5 h-5" /> Productos y Stocks Mín/Máx</h3>
        <div className="flex gap-2 mb-4 flex-wrap">
          <input type="text" value={newProduct} onChange={(e) => setNewProduct(e.target.value)} placeholder="Nuevo producto..." className="input flex-1 min-w-[200px]" />
          <button onClick={handleAdd} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" /> Agregar</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-blue-100"><tr>
              <th className="px-3 py-2 text-left text-blue-900">Producto</th><th className="px-3 py-2 text-center text-blue-900">Mín. Fábrica</th>
              <th className="px-3 py-2 text-center text-blue-900">Mín. Total</th><th className="px-3 py-2 text-center text-blue-900">Máx. Total</th>
              <th className="px-3 py-2 text-center text-blue-900">Acciones</th>
            </tr></thead>
            <tbody>
              {productsData.map((p, idx) => (
                <tr key={p.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                  <td className="px-3 py-2 font-medium text-blue-900">{p.nombre}</td>
                  <td className="px-3 py-2 text-center"><input type="number" defaultValue={p.min_fabrica} onBlur={(e) => onUpdateProduct(p.id, 'min_fabrica', Number(e.target.value) || 0)} className="w-20 text-center border border-blue-200 rounded px-1 py-0.5" /></td>
                  <td className="px-3 py-2 text-center"><input type="number" defaultValue={p.min_total} onBlur={(e) => onUpdateProduct(p.id, 'min_total', Number(e.target.value) || 0)} className="w-20 text-center border border-blue-200 rounded px-1 py-0.5" /></td>
                  <td className="px-3 py-2 text-center"><input type="number" defaultValue={p.max_total} onBlur={(e) => onUpdateProduct(p.id, 'max_total', Number(e.target.value) || 0)} className="w-20 text-center border border-blue-200 rounded px-1 py-0.5" /></td>
                  <td className="px-3 py-2 text-center"><button onClick={() => { if (confirm(`¿Eliminar ${p.nombre}?`)) onDeleteProduct(p.id, p.nombre); }} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {canManageUsers && (
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2"><Users className="w-5 h-5" /> Gestión de Usuarios</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
            <input type="text" placeholder="Usuario" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className="input" />
            <input type="text" placeholder="Nombre" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="input" />
            <input type="password" placeholder="Contraseña" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="input" />
            <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} className="input">
              <option value="Administrador">Administrador</option><option value="Encargado">Encargado</option><option value="Operario">Operario</option>
            </select>
            <button onClick={handleAddU} className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Crear</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-100"><tr>
                <th className="px-3 py-2 text-left text-blue-900">Usuario</th><th className="px-3 py-2 text-left text-blue-900">Nombre</th>
                <th className="px-3 py-2 text-left text-blue-900">Rol</th><th className="px-3 py-2 text-center text-blue-900">Acciones</th>
              </tr></thead>
              <tbody>
                {users.map((u, idx) => (
                  <tr key={u.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                    <td className="px-3 py-2 font-medium">{u.username}</td><td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-1 rounded-full text-xs font-semibold ${u.role === 'Administrador' ? 'bg-yellow-100 text-yellow-800' : u.role === 'Encargado' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>{u.role}</span></td>
                    <td className="px-3 py-2 text-center"><button onClick={() => { if (u.username === 'admin') { alert('No se puede eliminar al admin principal'); return; } if (confirm(`¿Eliminar ${u.username}?`)) onDeleteUser(u.id); }} className="bg-red-500 hover:bg-red-600 text-white p-1.5 rounded"><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) { return (<div><label className="block text-xs font-medium text-blue-900 mb-1">{label}</label>{children}</div>); }
function Modal({ children, onClose, title }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-blue-900">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

if (typeof document !== 'undefined' && !document.getElementById('app-styles')) {
  const style = document.createElement('style');
  style.id = 'app-styles';
  style.textContent = `.input{width:100%;padding:0.5rem 0.75rem;border:1px solid #bfdbfe;border-radius:0.5rem;font-size:0.875rem;background:white}.input:focus{outline:none;box-shadow:0 0 0 2px #3b82f6;border-color:#3b82f6}`;
  document.head.appendChild(style);
}