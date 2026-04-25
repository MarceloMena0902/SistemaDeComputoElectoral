"use client";

/**
 * ElectoralDashboard - Panel principal de resultados electorales
 *
 * Secciones:
 *  1. Header con progreso global
 *  2. Comparativa RRV vs Cómputo Oficial (BarChart)
 *  3. Distribución de votos por partido (PieChart)
 *  4. Calor de progreso por departamento (BarChart horizontal)
 *  5. Tabla de resultados detallada
 */

import React, { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, RadialBarChart, RadialBar,
} from "recharts";
import axios from "axios";

// ==============================================================
//  Tipos
// ==============================================================
interface ResultadoPartido {
  partido: string;
  color_hex: string;
  votos_rrv: number;
  votos_oficial: number;
  diferencia: number;
}

interface ProgresoDept {
  dept_codigo: string;
  departamento: string;
  pipeline: string;
  total_mesas: number;
  mesas_validadas: number;
  pct_completado: number;
}

// ==============================================================
//  Datos de demostración (se reemplazan con datos reales del API)
// ==============================================================
const DEMO_COMPARATIVA: ResultadoPartido[] = [
  { partido: "MAS-IPSP", color_hex: "#0066CC", votos_rrv: 158432, votos_oficial: 157890, diferencia: 542 },
  { partido: "CC",       color_hex: "#FF6600", votos_rrv: 98765,  votos_oficial: 98120,  diferencia: 645 },
  { partido: "CREEMOS",  color_hex: "#009900", votos_rrv: 67234,  votos_oficial: 66980,  diferencia: 254 },
  { partido: "FPV",      color_hex: "#CC0000", votos_rrv: 12450,  votos_oficial: 12300,  diferencia: 150 },
  { partido: "MTS",      color_hex: "#9900CC", votos_rrv: 8760,   votos_oficial: 8650,   diferencia: 110 },
  { partido: "UCS",      color_hex: "#FF9900", votos_rrv: 7890,   votos_oficial: 7820,   diferencia: 70  },
];

const DEMO_PROGRESO: ProgresoDept[] = [
  { dept_codigo: "SC", departamento: "Santa Cruz",  pipeline: "RRV", total_mesas: 1842, mesas_validadas: 1654, pct_completado: 89.8 },
  { dept_codigo: "LP", departamento: "La Paz",       pipeline: "RRV", total_mesas: 2103, mesas_validadas: 1780, pct_completado: 84.6 },
  { dept_codigo: "CB", departamento: "Cochabamba",   pipeline: "RRV", total_mesas: 1456, mesas_validadas: 1300, pct_completado: 89.3 },
  { dept_codigo: "PT", departamento: "Potosí",       pipeline: "RRV", total_mesas: 890,  mesas_validadas: 701,  pct_completado: 78.8 },
  { dept_codigo: "OR", departamento: "Oruro",        pipeline: "RRV", total_mesas: 567,  mesas_validadas: 456,  pct_completado: 80.4 },
  { dept_codigo: "CH", departamento: "Chuquisaca",   pipeline: "RRV", total_mesas: 456,  mesas_validadas: 389,  pct_completado: 85.3 },
  { dept_codigo: "TJ", departamento: "Tarija",       pipeline: "RRV", total_mesas: 389,  mesas_validadas: 310,  pct_completado: 79.7 },
  { dept_codigo: "BN", departamento: "Beni",         pipeline: "RRV", total_mesas: 298,  mesas_validadas: 234,  pct_completado: 78.5 },
  { dept_codigo: "PD", departamento: "Pando",        pipeline: "RRV", total_mesas: 145,  mesas_validadas: 121,  pct_completado: 83.4 },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ==============================================================
//  Componente principal
// ==============================================================
export default function ElectoralDashboard() {
  const [comparativa, setComparativa] = useState<ResultadoPartido[]>(DEMO_COMPARATIVA);
  const [progreso, setProgreso] = useState<ProgresoDept[]>(DEMO_PROGRESO);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date>(new Date());
  const [cargando, setCargando] = useState(false);

  // Cálculos globales
  const totalMesas = progreso.reduce((s, d) => s + (d.pipeline === "RRV" ? d.total_mesas : 0), 0);
  const mesasValidadas = progreso.reduce((s, d) => s + (d.pipeline === "RRV" ? d.mesas_validadas : 0), 0);
  const pctGlobal = totalMesas > 0 ? ((mesasValidadas / totalMesas) * 100).toFixed(1) : "0.0";

  const totalVotosRRV = comparativa.reduce((s, p) => s + p.votos_rrv, 0);

  // Polling cada 30 segundos
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [resComp, resProg] = await Promise.all([
          axios.get(`${API_URL}/resultados/comparativa`),
          axios.get(`${API_URL}/progreso`),
        ]);
        if (resComp.data.length) setComparativa(resComp.data);
        if (resProg.data.length) setProgreso(resProg.data);
        setUltimaActualizacion(new Date());
      } catch {
        // Silencioso en demo; en producción loggear
      }
    };

    cargarDatos();
    const intervalo = setInterval(cargarDatos, 30_000);
    return () => clearInterval(intervalo);
  }, []);

  // ==============================================================
  //  Preparar datos para gráficas
  // ==============================================================
  const dataPie = comparativa.map((p) => ({
    name: p.partido,
    value: p.votos_rrv,
    fill: p.color_hex,
  }));

  const progresoRRV = progreso.filter((d) => d.pipeline === "RRV" || !d.pipeline);

  // ==============================================================
  //  Render
  // ==============================================================
  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6">

      {/* ── HEADER ── */}
      <header className="mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              🗳️ Sistema Nacional de Cómputo Electoral
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Bolivia · Resultados en tiempo real
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              Actualizado: {ultimaActualizacion.toLocaleTimeString("es-BO")}
            </p>
            <div className="flex gap-2 mt-1">
              <span className="badge-rrv">● RRV EN VIVO</span>
              <span className="badge-oficial">◆ CÓMPUTO OFICIAL</span>
            </div>
          </div>
        </div>

        {/* Barra de progreso global */}
        <div className="mt-4 card">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-300">
              Progreso global de actas procesadas
            </span>
            <span className="text-2xl font-bold text-emerald-400">{pctGlobal}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-4 overflow-hidden">
            <div
              className="h-4 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-700"
              style={{ width: `${pctGlobal}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{mesasValidadas.toLocaleString()} mesas procesadas</span>
            <span>{(totalMesas - mesasValidadas).toLocaleString()} pendientes de {totalMesas.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* ── GRID PRINCIPAL ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── COMPARATIVA RRV vs OFICIAL ── */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            📊 Comparativa RRV vs Cómputo Oficial
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={comparativa} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="partido" stroke="#9CA3AF" tick={{ fontSize: 11 }} />
              <YAxis stroke="#9CA3AF" tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v: number, name: string) => [v.toLocaleString(), name]}
              />
              <Legend />
              <Bar dataKey="votos_rrv" name="RRV" fill="#00C49F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="votos_oficial" name="Cómputo Oficial" fill="#FFBB28" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        {/* ── DISTRIBUCIÓN POR PARTIDO (PIE) ── */}
        <section className="card">
          <h2 className="text-lg font-semibold mb-4">🥧 Distribución de votos (RRV)</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={280}>
              <PieChart>
                <Pie
                  data={dataPie}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {dataPie.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                  formatter={(v: number) => [v.toLocaleString() + " votos"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {comparativa.map((p) => (
                <div key={p.partido} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: p.color_hex }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{p.partido}</div>
                    <div className="text-xs text-gray-400">
                      {((p.votos_rrv / totalVotosRRV) * 100).toFixed(1)}% ·{" "}
                      {p.votos_rrv.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PROGRESO POR DEPARTAMENTO ── */}
        <section className="card xl:col-span-2">
          <h2 className="text-lg font-semibold mb-4">🗺️ Progreso de cómputo por departamento</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={progresoRRV}
              layout="vertical"
              margin={{ top: 5, right: 50, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                stroke="#9CA3AF"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
              />
              <YAxis
                dataKey="departamento"
                type="category"
                stroke="#9CA3AF"
                tick={{ fontSize: 11 }}
                width={90}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v: number) => [`${v.toFixed(1)}%`, "Completado"]}
              />
              <Bar dataKey="pct_completado" name="% Completado" radius={[0, 4, 4, 0]}>
                {progresoRRV.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.pct_completado >= 90
                        ? "#10B981"
                        : d.pct_completado >= 70
                        ? "#F59E0B"
                        : "#EF4444"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 text-xs text-gray-400 justify-center">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded inline-block" /> ≥90%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded inline-block" /> 70-89%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded inline-block" /> &lt;70%</span>
          </div>
        </section>

        {/* ── TABLA DE DIFERENCIAS ── */}
        <section className="card xl:col-span-2">
          <h2 className="text-lg font-semibold mb-4">🔍 Diferencias RRV vs Cómputo Oficial</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-gray-800">
                  <th className="text-left py-2 px-3">Partido</th>
                  <th className="text-right py-2 px-3">Votos RRV</th>
                  <th className="text-right py-2 px-3">Cómputo Oficial</th>
                  <th className="text-right py-2 px-3">Diferencia</th>
                  <th className="text-right py-2 px-3">% RRV</th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map((p) => (
                  <tr
                    key={p.partido}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-2 px-3 flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: p.color_hex }}
                      />
                      <span className="font-semibold">{p.partido}</span>
                    </td>
                    <td className="text-right py-2 px-3 text-emerald-400 font-mono">
                      {p.votos_rrv.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-3 text-yellow-400 font-mono">
                      {p.votos_oficial.toLocaleString()}
                    </td>
                    <td className={`text-right py-2 px-3 font-mono ${
                      Math.abs(p.diferencia) > 500 ? "text-red-400" : "text-gray-400"
                    }`}>
                      {p.diferencia > 0 ? "+" : ""}{p.diferencia.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-3 text-gray-300">
                      {((p.votos_rrv / totalVotosRRV) * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-gray-600 font-bold">
                  <td className="py-2 px-3">TOTAL</td>
                  <td className="text-right py-2 px-3 text-emerald-400 font-mono">
                    {totalVotosRRV.toLocaleString()}
                  </td>
                  <td className="text-right py-2 px-3 text-yellow-400 font-mono">
                    {comparativa.reduce((s, p) => s + p.votos_oficial, 0).toLocaleString()}
                  </td>
                  <td className="text-right py-2 px-3 font-mono text-gray-400">
                    {comparativa.reduce((s, p) => s + p.diferencia, 0).toLocaleString()}
                  </td>
                  <td className="text-right py-2 px-3">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-gray-600">
        Sistema Nacional de Cómputo Electoral Bolivia · Datos en tiempo real · v1.0.0
      </footer>
    </div>
  );
}
