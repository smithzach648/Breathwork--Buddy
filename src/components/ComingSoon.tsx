interface Props { title:string; eyebrow:string; heading:string; children:React.ReactNode; }
export function ComingSoon({ title,eyebrow,heading,children }:Props) {
  return <>
    <p className="eyebrow">{eyebrow}</p><h1>{title}</h1>
    <section className="panel placeholder">
      <span className="badge">Coming in a later phase</span><h2>{heading}</h2>
      <p>{children}</p><p className="muted">This space is a preview.</p>
    </section>
  </>;
}
