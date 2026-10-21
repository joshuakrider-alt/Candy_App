import { cn } from "@/lib/utils";

/** The card every seller screen is built from, matching the account pages. */
export function Panel({
  title,
  description,
  className,
  children,
}: {
  title?: string;
  description?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg bg-paper/95 p-5 shadow-candy", className)}>
      {title && <h2 className="font-heading text-2xl font-bold text-cola">{title}</h2>}
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {children && <div className={cn(title || description ? "mt-4" : undefined)}>{children}</div>}
    </section>
  );
}

/** A line of feedback under a form: polite for progress, an alert for errors. */
export function FormMessage({ error, children }: { error?: boolean; children?: React.ReactNode }) {
  if (!children) return null;
  return error ? (
    <p role="alert" className="text-sm font-bold text-destructive">
      {children}
    </p>
  ) : (
    <p role="status" className="text-sm font-bold text-cola">
      {children}
    </p>
  );
}
