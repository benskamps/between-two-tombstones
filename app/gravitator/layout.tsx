import "./gravitator.css";

// The Gravitator's look became the whole app's (decision 18). Its route names
// (--g-*) alias the global palette; see gravitator.css. The theme color comes
// from the root layout, which already uses the same crepe black.
export default function GravitatorLayout({ children }: LayoutProps<"/gravitator">) {
  return <div className="gravitator">{children}</div>;
}
