export function Home({onExplore}:{onExplore:()=>void}) {
  return <>
    <p className="eyebrow">A LITTLE SPACE FOR YOURSELF</p>
    <h1>Come back<br />to your breath.</h1>
    <p className="intro">A quiet place to pause, find your rhythm, and make room for the day.</p>
    <section className="hero">
      <span className="eyebrow">YOUR PRACTICE, AT YOUR PACE</span>
      <h2>Small moments.<br />A steadier day.</h2>
      <p>We’re creating a simpler way to practice with gentle audio guidance and space to reflect.</p>
      <button className="primary" onClick={onExplore}>Explore the practice space <span aria-hidden="true">→</span></button>
    </section>
    <div className="cards">
      <section><span className="number">01</span><h2>Keep it personal</h2><p>Your preferences live on this device. No account needed.</p></section>
      <section><span className="number">02</span><h2>Room to grow</h2><p>Guided practices and reflections will arrive in the next stages.</p></section>
    </div>
    <p className="footnote">The foundation is here. Your new practice experience is taking shape.</p>
  </>;
}
