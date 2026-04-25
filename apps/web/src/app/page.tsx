import ElectoralDashboard from "@/components/ElectoralDashboard";

export const metadata = {
  title: "Sistema de Cómputo Electoral - Bolivia",
  description: "Panel de resultados electorales en tiempo real",
};

export default function Home() {
  return <ElectoralDashboard />;
}
