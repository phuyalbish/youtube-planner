import { Dashboard } from "@/components/Dashboard";
import { AuthGate } from "@/components/AuthGate";

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
