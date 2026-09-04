import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export default function StatCard({ title, value, icon: Icon, trend, color }) {
  return (
    <div className="card stat-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="stat-header">
        <span>{title}</span>
        <div style={{ color, background: `${color}20`, padding: '0.5rem', borderRadius: '8px' }}>
          {Icon && <Icon size={24} />}
        </div>
      </div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div className={`stat-trend ${trend.isPositive ? 'trend-up' : 'trend-down'}`}>
          {trend.isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          <span>{trend.value}% from last month</span>
        </div>
      )}
    </div>
  );
}
