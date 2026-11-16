import { QuickRoutines } from '../routines/QuickRoutines';
export function Home({ onExplore, onRoutines, onStartRoutine, onMeditation, onMeditate }: {
    onExplore: () => void;
    onMeditation: () => void;
    onMeditate?: () => void;
    onRoutines: () => void;
    onStartRoutine: (id: string) => Promise<void>;
}) {
    return <>
    <p className="eyebrow">A LITTLE SPACE FOR YOURSELF</p>
    <h1>Come back<br />to your breath.</h1>
    <p className="intro">A quiet place to pause, find your rhythm, and make room for the day.</p>
    <section className="hero">
      <span className="eyebrow">YOUR PRACTICE, AT YOUR PACE</span>
      <h2>Small moments.<br />A steadier day.</h2>
      <p>Find a comfortable rhythm with local voice guidance, natural breath sounds, and space to pause.</p>
      <button className="primary" onClick={onExplore}>Explore the practice space <span aria-hidden="true">→</span></button>
    </section>
    {onMeditate&&<section className="panel suite-home"><span className="eyebrow">I WANT TO MEDITATE</span><h2>A familiar way inward.</h2><p>Two complete journeys with thoughtful preparation, musical breath pacing, continuous sound, and a gentle return.</p><button className="primary" onClick={onMeditate}>Explore journeys <span aria-hidden="true">→</span></button></section>}
    <section className="panel"><h2>Meditation timer</h2><p>Settle in with a familiar breath and a quiet sound environment.</p><button onClick={onMeditation}>Explore meditation</button></section>
    <QuickRoutines onOpen={onRoutines} onStart={onStartRoutine}/>
    <div className="cards">
      <section><span className="number">01</span><h2>Keep it personal</h2><p>Your preferences live on this device. No account needed.</p></section>
      <section><span className="number">02</span><h2>At your pace</h2><p>Choose a gentle breathing pattern or a retention practice. Stop whenever you need.</p></section>
    </div>
    <p className="footnote">Your practice and history stay on this device.</p>
  </>;
}
