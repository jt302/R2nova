import { QueryProvider } from '@/app/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/pages/app-shell';

export function App() {
	return (
		<QueryProvider>
			<TooltipProvider>
				<AppShell />
				<Toaster position="bottom-right" richColors closeButton />
			</TooltipProvider>
		</QueryProvider>
	);
}
