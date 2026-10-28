import { useEffect } from 'react';
import ExecutiveDashboard from '../components/dashboard/ExecutiveDashboard.jsx';

/** Página do Dashboard de Planejamento (Contrato CT251). */
export default function DashboardPlanejamento() {
  useEffect(() => {
    const anterior = document.title;
    document.title = 'Dashboard de Planejamento · Synapse';
    return () => {
      document.title = anterior;
    };
  }, []);

  return <ExecutiveDashboard />;
}
