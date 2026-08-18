import type { ReactNode } from 'react';

export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<h1 className="text-lg font-semibold tracking-tight">{title}</h1>
				{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
			</div>
			{actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
		</div>
	);
}
