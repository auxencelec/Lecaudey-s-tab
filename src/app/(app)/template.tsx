// template.tsx re-instantiates on each route change, so animations re-trigger.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in">{children}</div>;
}
